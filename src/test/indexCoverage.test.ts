/**
 * Static index-coverage guard — the only automatable defense against the class
 * of bug that caused the launch-day incident: a collectionGroup query that
 * passes every emulator suite (the emulator does NOT enforce indexes) and then
 * throws FAILED_PRECONDITION in production because firestore.indexes.json has
 * no COLLECTION_GROUP index for the queried field.
 *
 * Scans src/, firebase/functions/src/, and scripts/ for collectionGroup(...)
 * call sites, extracts the queried field(s) from the surrounding statement,
 * and asserts each is covered by a fieldOverride or composite index with
 * COLLECTION_GROUP scope.
 *
 * A SECOND guard covers plain-collection `where(...) + orderBy(<other field>)`
 * queries (e.g. rooms deletedAt+name — the Items-page incident), which require a
 * COLLECTION-scope composite that neither the emulator nor the guard above catches.
 */
import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, resolve } from "node:path"

const ROOT = resolve(__dirname, "../..")
const SCAN_DIRS = ["src", "firebase/functions/src", "scripts"]

type IndexesFile = {
  indexes: Array<{ collectionGroup: string; queryScope: string; fields: Array<{ fieldPath: string }> }>
  fieldOverrides: Array<{ collectionGroup: string; fieldPath: string; indexes: Array<{ queryScope: string }> }>
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "lib" || name === "dist") continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx|mjs)$/.test(name) && !/\.test\.|\.spec\./.test(name)) out.push(p)
  }
  return out
}

/** collectionGroup("name") … where("field" — client (query(collectionGroup(db,"x"), where("f"…)
 *  and Admin (.collectionGroup("x").where("f"…) shapes both land in the window. */
function extractQueries(sourcePath: string): Array<{ coll: string; fields: string[]; at: string }> {
  const text = readFileSync(sourcePath, "utf8")
  const out: Array<{ coll: string; fields: string[]; at: string }> = []
  const re = /collectionGroup\(\s*(?:db(?:\(\))?\s*,\s*)?["'`](\w+)["'`]\s*\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    // Window = this statement only: stop at the next collectionGroup( call or
    // the chain-terminating .get() — otherwise adjacent probes (prod-smoke.ts)
    // bleed their where() clauses into each other.
    const rest = text.slice(m.index + m[0].length)
    const nextCg = rest.search(/collectionGroup\(/)
    const nextGet = rest.search(/\.get\(\)/)
    const ends = [nextCg, nextGet === -1 ? -1 : nextGet + 6, 400].filter((n) => n >= 0)
    const window = rest.slice(0, Math.min(...ends))
    const fields = [...window.matchAll(/where\(\s*["'`]([\w.]+)["'`]/g)].map((w) => w[1])
    if (fields.length > 0) out.push({ coll: m[1], fields, at: sourcePath.replace(ROOT + "/", "") })
  }
  return out
}

/**
 * Plain-collection composite guard. `query(collection(db, "…/rooms"),
 * where("deletedAt","==",null), orderBy("name"))` needs a COLLECTION-scope
 * composite [deletedAt, name] — a shape neither the emulator nor the
 * collectionGroup guard above catches (the Items-page rooms incident).
 * Anchors on each orderBy("field") and walks back to the nearest collection(…)
 * in the same statement, collecting the where() equality fields in between.
 * Skips: pure orderBy (single-field is automatic), orderBy on an already-filtered
 * field (no extra index), and collectionGroup() queries (handled above).
 */
function extractCompositeQueries(sourcePath: string): Array<{ coll: string; fields: string[]; order: string; at: string }> {
  const text = readFileSync(sourcePath, "utf8")
  const out: Array<{ coll: string; fields: string[]; order: string; at: string }> = []
  const at = sourcePath.replace(ROOT + "/", "")
  const obRe = /orderBy\(\s*["'`]([\w.]+)["'`]/g
  let m: RegExpExecArray | null
  while ((m = obRe.exec(text))) {
    const order = m[1]
    const back = text.slice(Math.max(0, m.index - 600), m.index)
    const colls = [...back.matchAll(/collection\(\s*(?:db(?:\(\))?\s*,\s*)?["'`]([^"'`]+)["'`]\s*\)/g)]
    const lastColl = colls[colls.length - 1]
    if (!lastColl) continue // collection path built from a variable — not statically resolvable
    const cgs = [...back.matchAll(/collectionGroup\(/g)]
    const lastCg = cgs[cgs.length - 1]
    if (lastCg && (lastCg.index ?? 0) > (lastColl.index ?? 0)) continue // a collectionGroup query — the CG guard owns it
    const coll = lastColl[1].split("/").filter((s) => s && !s.includes("${")).pop() ?? ""
    if (!coll) continue
    const between = back.slice((lastColl.index ?? 0) + lastColl[0].length)
    const fields = [...between.matchAll(/where\(\s*["'`]([\w.]+)["'`]/g)].map((w) => w[1])
    if (fields.length === 0) continue // pure orderBy → automatic single-field index
    if (fields.includes(order)) continue // orderBy on a filtered field → no extra composite needed
    out.push({ coll, fields, order, at })
  }
  return out
}

describe("collectionGroup index coverage (firestore.indexes.json)", () => {
  const indexes = JSON.parse(readFileSync(join(ROOT, "firestore.indexes.json"), "utf8")) as IndexesFile

  const cgOverride = (coll: string, field: string) =>
    indexes.fieldOverrides.some(
      (o) => o.collectionGroup === coll && o.fieldPath === field && o.indexes.some((i) => i.queryScope === "COLLECTION_GROUP")
    )
  const cgComposite = (coll: string, fields: string[]) =>
    indexes.indexes.some(
      (i) =>
        i.collectionGroup === coll &&
        i.queryScope === "COLLECTION_GROUP" &&
        fields.every((f) => i.fields.some((x) => x.fieldPath === f))
    )

  const queries = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d))).flatMap(extractQueries)

  it("found the known collection-group query sites", () => {
    // Sanity: the scanner must at least see the sign-in query — if this fails,
    // the regex drifted and the guard is blind.
    expect(queries.some((q) => q.coll === "members" && q.fields.includes("uid"))).toBe(true)
  })

  it.each(queries.map((q) => [q.coll, q.fields.join("+"), q] as const))(
    "collectionGroup(%s).where(%s) is index-covered",
    (_coll, _fields, q) => {
      const covered =
        q.fields.every((f) => cgOverride(q.coll, f)) || cgComposite(q.coll, q.fields)
      expect(
        covered,
        `${q.at}: collectionGroup("${q.coll}") on [${q.fields.join(", ")}] has no COLLECTION_GROUP ` +
          `fieldOverride/composite in firestore.indexes.json — this WILL fail in prod ` +
          `(the emulator does not enforce indexes).`
      ).toBe(true)
    }
  )
})

describe("plain-collection composite index coverage (firestore.indexes.json)", () => {
  const indexes = JSON.parse(readFileSync(join(ROOT, "firestore.indexes.json"), "utf8")) as IndexesFile

  const collComposite = (coll: string, needed: string[]) =>
    indexes.indexes.some(
      (i) =>
        i.collectionGroup === coll &&
        i.queryScope === "COLLECTION" &&
        needed.every((f) => i.fields.some((x) => x.fieldPath === f))
    )

  const queries = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d))).flatMap(extractCompositeQueries)

  it("found the known plain-collection composite query (rooms deletedAt+name)", () => {
    // Sanity: the scanner must at least see the Items-page rooms query — if this
    // fails, the regex drifted and this guard is blind.
    expect(queries.some((q) => q.coll === "rooms" && q.fields.includes("deletedAt") && q.order === "name")).toBe(true)
  })

  it.each(queries.map((q) => [q.coll, [...q.fields, q.order].join("+"), q] as const))(
    "collection(%s) where+orderBy on [%s] has a COLLECTION composite",
    (_coll, _fields, q) => {
      expect(
        collComposite(q.coll, [...q.fields, q.order]),
        `${q.at}: collection("${q.coll}") with where(${q.fields.join(", ")}) + orderBy("${q.order}") has no ` +
          `COLLECTION composite in firestore.indexes.json covering [${[...q.fields, q.order].join(", ")}] — ` +
          `this WILL fail in prod (the emulator does not enforce indexes).`
      ).toBe(true)
    }
  )
})
