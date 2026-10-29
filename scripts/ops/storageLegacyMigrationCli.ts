/**
 * The pure half of migrate-legacy-storage.ts: argument parsing, the
 * production guard, and the census formatting (counts and bytes only).
 * Firebase-free so the unit run gates the guard — the thing that decides
 * whether a run may touch production at all.
 */
import { PROTECTED_HOMES, redact, type MigrationPlan, type MigrationSummary, type Tally } from "./storageLegacyMigration.js"

export const PROD_PROJECT = "homehub-2068d"
/** The only buckets production may name. A wrong name would not fail — it
 *  would silently push every URL reference into "foreign bucket" — so the
 *  name is checked here and the bucket's existence after init. */
export const PROD_BUCKETS: readonly string[] = [`${PROD_PROJECT}.appspot.com`, `${PROD_PROJECT}.firebasestorage.app`]

// ── arguments ────────────────────────────────────────────────────────────────

export interface Args {
  project: string
  bucket: string | null
  ownerApproval: boolean
  apply: boolean
  manifest: string | null
  rollback: string | null
  verify: string | null
  homes: string[]
  list: boolean
  report: string | null
  /** Protected homes the operator asks to include (needs soniaAgreed too). */
  includeHomes: string[]
  soniaAgreed: boolean
}

/** Parse argv. Throws (never exits) so the guard is unit-testable. */
export function parseArgs(argv: string[]): Args {
  const out: Args = {
    project: "demo-homehub",
    bucket: null,
    ownerApproval: false,
    apply: false,
    manifest: null,
    rollback: null,
    verify: null,
    homes: [],
    list: false,
    report: null,
    includeHomes: [],
    soniaAgreed: false,
  }
  const args = [...argv]
  while (args.length > 0) {
    const arg = args.shift()!
    const eq = arg.indexOf("=")
    const flag = eq === -1 ? arg : arg.slice(0, eq)
    const inline = eq === -1 ? undefined : arg.slice(eq + 1)
    const take = (): string => {
      const v = inline ?? args.shift()
      if (!v || v.startsWith("--")) throw new Error(`${flag} needs a value.`)
      return v
    }
    if (flag === "--project") out.project = take()
    else if (flag === "--bucket") out.bucket = take()
    else if (flag === "--i-have-owner-approval") out.ownerApproval = true
    else if (flag === "--apply") out.apply = true
    else if (flag === "--manifest") out.manifest = take()
    else if (flag === "--rollback") out.rollback = take()
    else if (flag === "--verify") out.verify = take()
    else if (flag === "--home") out.homes.push(take())
    else if (flag === "--list") out.list = true
    else if (flag === "--report") out.report = take()
    else if (flag === "--include-home") out.includeHomes.push(take())
    else if (flag === "--sonia-agreed") out.soniaAgreed = true
    else if (flag === "--") continue
    else throw new Error(`Unknown argument ${JSON.stringify(arg)} (see the header of scripts/ops/migrate-legacy-storage.ts).`)
  }
  const modes = [out.apply, out.rollback !== null, out.verify !== null].filter(Boolean).length
  if (modes > 1) throw new Error("Pick one of --apply, --rollback, --verify.")
  if (out.apply && !out.manifest) throw new Error("--apply needs --manifest <file> (created if absent; reuse it to resume).")
  return out
}

export type Target =
  | { kind: "emulator"; project: string; bucket: string }
  | { kind: "production"; project: string; bucket: string }

/**
 * Decide what this run may touch. Emulator unless BOTH --project homehub-2068d
 * and --i-have-owner-approval are given; even then --apply additionally needs
 * --home, and an explicit --bucket is always required in production.
 */
export function resolveTarget(args: Args, env: Record<string, string | undefined>): Target {
  const emulatorEnv = Boolean(env.FIRESTORE_EMULATOR_HOST || env.FIREBASE_STORAGE_EMULATOR_HOST || env.STORAGE_EMULATOR_HOST)
  if (args.project.startsWith("demo-")) {
    return { kind: "emulator", project: args.project, bucket: args.bucket ?? `${args.project}.appspot.com` }
  }
  if (args.project !== PROD_PROJECT) {
    throw new Error(`Refusing project ${JSON.stringify(args.project)}: only demo-* emulator projects, or ${PROD_PROJECT} with owner approval.`)
  }
  if (!args.ownerApproval) {
    throw new Error(`--project ${PROD_PROJECT} also needs --i-have-owner-approval (the owner approves each production step).`)
  }
  if (emulatorEnv) throw new Error("Production project with emulator env vars set — unset FIRESTORE_EMULATOR_HOST / FIREBASE_STORAGE_EMULATOR_HOST first.")
  if (!args.bucket) throw new Error("Production needs an explicit --bucket <name> (the gs:// name in the console, without gs://).")
  if (!PROD_BUCKETS.includes(args.bucket)) {
    throw new Error(`--bucket ${JSON.stringify(args.bucket)} is not this project's bucket; expected one of ${PROD_BUCKETS.join(" | ")}.`)
  }
  if (args.apply && args.homes.length === 0) {
    throw new Error("--apply in production needs --home <homeId> (one household at a time, each approved).")
  }
  return { kind: "production", project: args.project, bucket: args.bucket }
}

/**
 * The protected homes still DENIED for this run. A protected home is lifted
 * only by naming it with --include-home AND passing --sonia-agreed; either
 * alone is refused, so a typo or a half-remembered flag cannot lift it.
 */
export function deniedProtectedHomes(args: Args): Set<string> {
  for (const id of args.includeHomes) {
    if (!PROTECTED_HOMES.has(id)) throw new Error(`--include-home ${id}: not a protected home (only ${[...PROTECTED_HOMES.keys()].join(", ")} needs it).`)
  }
  if (args.includeHomes.length > 0 && !args.soniaAgreed) {
    throw new Error("--include-home also needs --sonia-agreed: that home is Sonia's, and moving her files needs her agreement.")
  }
  if (args.soniaAgreed && args.includeHomes.length === 0) throw new Error("--sonia-agreed without --include-home <id> lifts nothing.")
  const denied = new Set(PROTECTED_HOMES.keys())
  for (const id of args.includeHomes) denied.delete(id)
  for (const id of args.homes) {
    if (denied.has(id)) {
      throw new Error(`--home ${id} is ${PROTECTED_HOMES.get(id)}. Add --include-home ${id} --sonia-agreed only once she has agreed.`)
    }
  }
  return denied
}

/** Refuse --home ids that do not exist; otherwise the lines to print about
 *  what is about to be touched (name and member count, never member ids). */
export function homeGate(facts: ReadonlyArray<{ id: string; exists: boolean; name: string | null; members: number }>): string[] {
  const unknown = facts.filter((f) => !f.exists)
  if (unknown.length > 0) throw new Error(`Unknown --home id(s): ${unknown.map((f) => f.id).join(", ")} — no such home on this target.`)
  return facts.map((f) => `  --home ${f.id}  "${f.name ?? "(no name)"}"  ${f.members} member(s)${PROTECTED_HOMES.has(f.id) ? `  [${PROTECTED_HOMES.get(f.id)} — included by --sonia-agreed]` : ""}`)
}

/** Non-zero whenever anything was left undone or unproven: a failed copy, a
 *  field changed since the plan, a reference not holding its new value, a
 *  missing copy or a missing original. */
export function applyExitCode(
  res: { copyFailed: unknown[]; fieldConflicts: unknown[] },
  v: { refsNotUpdated: unknown[]; destinationsMissing: unknown[]; originalsMissing: unknown[] },
): number {
  const bad = res.copyFailed.length + res.fieldConflicts.length + v.refsNotUpdated.length + v.destinationsMissing.length + v.originalsMissing.length
  return bad > 0 ? 2 : 0
}

/** One line every `every` items and on the last, for long applies. */
export function progressLine(p: { phase: "copy" | "ref"; done: number; total: number }, every = 25): string | null {
  if (p.total === 0 || (p.done % every !== 0 && p.done !== p.total - 1)) return null
  return `  … ${p.phase === "copy" ? "copying objects" : "rewriting documents"} ${p.done + 1}/${p.total}`
}

// ── output (counts and bytes only) ───────────────────────────────────────────

const mb = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(2)} MB` : bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B`
const tally = (t: Tally) => `${t.count} (${mb(t.bytes)})`

export function formatSummary(s: MigrationSummary): string[] {
  const out: string[] = []
  out.push(`Objects: ${tally(s.objects.tenant)} under homes/ · ${tally(s.objects.legacy)} legacy (outside homes/)`)
  for (const [fam, t] of Object.entries(s.objects.legacyByFamily).sort()) out.push(`  legacy ${fam.padEnd(42)} ${tally(t)}`)
  out.push(`  legacy objects carrying a download token: ${tally(s.objects.legacyWithDownloadToken)}`)
  out.push("")
  out.push(`References found: ${Object.values(s.refs.byCategory).reduce((n, c) => n + c.total, 0)} (${s.refs.legacyTotal} to legacy objects, ${s.refs.tokenUrlsTotal} token-bearing URLs)`)
  for (const [cat, c] of Object.entries(s.refs.byCategory).sort()) {
    out.push(`  ${cat.padEnd(56)} total ${c.total} · legacy ${c.legacy} · tenant ${c.tenant} · token URLs ${c.tokenUrls}`)
  }
  for (const [cat, n] of Object.entries(s.refs.v1UrlsByCategory).sort()) out.push(`  ${cat.padEnd(56)} dead v1 (Supabase) URLs ${n} — reported only`)
  out.push(`Foreign-bucket Storage URLs (another bucket; reported, never rewritten): ${s.foreignBucketUrls.total}`)
  for (const [b, n] of Object.entries(s.foreignBucketUrls.byBucket).sort()) out.push(`  bucket ${b.padEnd(48)} ${n}`)
  for (const [cat, n] of Object.entries(s.foreignBucketUrls.byCategory).sort()) out.push(`  ${cat.padEnd(56)} ${n}`)
  out.push(`Unrecognised values in photo / receipt / uploaded-manual fields (left alone; check before cutover): ${s.unrecognised.total}`)
  for (const [cat, kinds] of Object.entries(s.unrecognised.byCategory).sort()) {
    out.push(`  ${cat.padEnd(56)} ${Object.entries(kinds).map(([k, n]) => `${k} ${n}`).join(" · ")}`)
  }
  out.push("")
  out.push(`Plan: copy ${tally(s.plan.toCopy)} · already copied ${tally(s.plan.alreadyCopied)} · rewrite ${s.plan.refUpdates} reference(s)`)
  for (const [cat, n] of Object.entries(s.plan.refUpdatesByCategory).sort()) out.push(`  rewrite ${cat.padEnd(48)} ${n}`)
  for (const [home, h] of Object.entries(s.plan.byHome).sort()) out.push(`  home ${home}: ${h.objects} object(s), ${mb(h.bytes)}, ${h.refUpdates} reference(s)`)
  out.push("")
  out.push(`Skipped — ambiguous (several homes): ${tally(s.ambiguous.multipleHomes)}`)
  out.push(`Skipped — ambiguous (referenced outside any home): ${tally(s.ambiguous.referencedOutsideAHome)}`)
  out.push(`Skipped — missing object behind a legacy reference: ${s.missing.refs}`)
  for (const [cat, n] of Object.entries(s.missing.byCategory).sort()) out.push(`  missing ${cat.padEnd(48)} ${n}`)
  out.push(`Skipped — destination exists with different bytes: ${s.conflicts}`)
  out.push(`Skipped — outside --home: ${s.outOfScope.objects}${Object.keys(s.outOfScope.byHome).length ? ` (${Object.entries(s.outOfScope.byHome).map(([h, n]) => `${h}: ${n}`).join(", ")})` : ""}`)
  out.push(`Skipped — protected home (needs --include-home + --sonia-agreed): ${s.protectedSkipped.objects}${Object.keys(s.protectedSkipped.byHome).length ? ` (${Object.entries(s.protectedSkipped.byHome).map(([h, n]) => `${h}: ${n}`).join(", ")})` : ""}`)
  out.push(`Unreferenced legacy objects (left in place): ${tally(s.unreferencedLegacy)}`)
  for (const [fam, t] of Object.entries(s.unreferencedLegacy.byFamily).sort()) out.push(`  unreferenced ${fam.padEnd(42)} ${tally(t)}`)
  out.push(`Migrated originals awaiting the owner's cleanup decision: ${tally(s.migratedOriginals)}`)
  out.push(`Pre-existing anomalies (not this migration's to fix): ${s.crossHomeTenantRefs} tenant path(s) referenced from another home · ${s.missingTenantRefs} tenant reference(s) with no object`)
  return out
}

export function formatListing(plan: MigrationPlan): string[] {
  const out: string[] = []
  for (const a of plan.ambiguous) {
    out.push(`  AMBIGUOUS ${a.reason} ${redact(a.objectPath)} ← ${a.refs.map((r) => `${r.docPath} (${r.category})`).join(", ")}`)
  }
  for (const m of plan.missing) out.push(`  MISSING ${redact(m.objectPath)} ← ${m.docPath} (${m.category})`)
  for (const c of plan.conflicts) out.push(`  CONFLICT ${redact(c.src)} → ${redact(c.dst)} exists with different bytes`)
  for (const u of plan.unrecognised) out.push(`  UNRECOGNISED ${u.kind} ← ${u.docPath} (${u.category})`)
  for (const f of plan.foreignBucketUrls) out.push(`  FOREIGN-BUCKET ${f.bucket} ← ${f.docPath} (${f.category})`)
  return out
}

