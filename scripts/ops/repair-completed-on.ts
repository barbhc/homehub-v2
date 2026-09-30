/**
 * repair-completed-on — one home's check-offs that were recorded a day late.
 *
 * Until the completedOn fix, every check-off sent the UTC date, so one made
 * after ~5 pm Pacific was recorded as the NEXT day, and a recurring task's
 * next due date rolled forward from that day. This finds those rows in ONE
 * home and moves their completion day back to the home's calendar day.
 *
 * What the rows actually hold (completeTask never stores `completedOn`):
 *   completedAt = <day it was recorded as>T12:00:00Z
 *   updatedAt   = the moment of the check-off (until the row is written again)
 * A row is repaired only when its recorded day is the UTC date of that moment
 * but not the home's date of it. Everything else is counted and left alone.
 * The rule is completedOnRepair.ts (unit-tested); this file is the I/O.
 *
 * SAFETY
 *   · --home <homeId> is REQUIRED. One home per run, never the project.
 *   · Dry run by DEFAULT. --apply writes.
 *   · --apply writes ONLY `completedAt` (to noon UTC of the corrected day, the
 *     shape completeTask writes) plus a `completedOnRepair` audit stamp, on
 *     rows classified shifted. Each write is conditional on the row's
 *     last-update time, so a row that changed after the read is skipped, not
 *     overwritten. `updatedAt` is left as it is on purpose: it is the evidence,
 *     and keeping it makes a second run find nothing left to do.
 *   · Due dates are NEVER rewritten. When a next instance's due date was
 *     derived from a shifted day, the output says so and what it would have
 *     been; whether to move it is a human decision.
 *   · --until <ISO instant> skips check-offs at or after it. Once the fixed
 *     client is live, a device EAST of the home can legitimately send "its"
 *     date near midnight, which looks the same; pass the deploy time.
 *
 *   Emulator (FIRESTORE_EMULATOR_HOST set → no credentials, demo-homehub):
 *     FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx tsx scripts/ops/repair-completed-on.ts --home e2e-home
 *   Production — owner/gatekeeper only, never from a test run:
 *     GOOGLE_APPLICATION_CREDENTIALS=<sa.json> FIREBASE_PROJECT_ID=homehub-2068d \
 *       npx tsx scripts/ops/repair-completed-on.ts --home <homeId> [--until <ISO>] [--apply]
 */
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app"
import { FieldValue, getFirestore, Timestamp, type DocumentData } from "firebase-admin/firestore"
import { DEFAULT_HOME_TIMEZONE } from "../../firebase/functions/src/tasks/completedOn.js"
import {
  classifyCompletedRow,
  describeNextDue,
  findNextInstance,
  type NextDueNote,
  type RowVerdict,
  type SiblingFacts,
} from "./completedOnRepair.js"

const SCRIPT = "scripts/ops/repair-completed-on.ts"

function die(msg: string): never {
  console.error(`\n✖ ${msg}\n`)
  process.exit(1)
}

// ── arguments ────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): { home: string; apply: boolean; until: Date | null } {
  let home: string | null = null
  let until: Date | null = null
  let apply = false
  let dryRun = false
  const args = [...argv]
  while (args.length > 0) {
    const arg = args.shift()!
    const eq = arg.indexOf("=")
    const flag = eq === -1 ? arg : arg.slice(0, eq)
    const inline = eq === -1 ? undefined : arg.slice(eq + 1)
    const take = (): string => {
      const v = inline ?? args.shift()
      if (!v || v.startsWith("--")) die(`${flag} needs a value.`)
      return v
    }
    if (flag === "--home") home = take()
    else if (flag === "--until") {
      const raw = take()
      const t = Date.parse(raw)
      if (Number.isNaN(t)) die(`--until is not a date/time: ${JSON.stringify(raw)} (use ISO, e.g. 2026-09-30T18:00:00Z).`)
      until = new Date(t)
    } else if (flag === "--apply") apply = true
    else if (flag === "--dry-run") dryRun = true
    else if (flag === "--") continue // separator some runners pass through
    else die(`Unknown argument ${JSON.stringify(arg)}. Usage: --home <homeId> [--until <ISO>] [--dry-run | --apply]`)
  }
  if (!home) die("--home <homeId> is required. This repairs ONE home per run — it never runs project-wide.")
  if (apply && dryRun) die("--apply and --dry-run together is ambiguous; pick one.")
  return { home, apply, until }
}

// ── target ───────────────────────────────────────────────────────────────────

function connect(): { label: string } {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST
  if (emulatorHost) {
    const projectId = process.env.GCLOUD_PROJECT || "demo-homehub"
    if (getApps().length === 0) initializeApp({ projectId })
    return { label: `EMULATOR ${projectId} @ ${emulatorHost}` }
  }
  const projectId = process.env.FIREBASE_PROJECT_ID
  if (!projectId) die("FIREBASE_PROJECT_ID is required outside the emulator (and GOOGLE_APPLICATION_CREDENTIALS).")
  if (getApps().length === 0) initializeApp({ credential: applicationDefault(), projectId })
  return { label: `PRODUCTION project ${projectId}` }
}

// ── helpers ──────────────────────────────────────────────────────────────────

const asDate = (v: unknown): Date | null => (v instanceof Timestamp ? v.toDate() : null)

function isKnownTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz })
    return true
  } catch {
    return false // RangeError — main() refuses to guess a zone for a repair
  }
}

function homeClock(d: Date, timeZone: string): string {
  return d.toLocaleString("en-US", { timeZone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
}

function describeNext(note: NextDueNote): string {
  const tail = (n: { status: string; deleted: boolean }) => ` [${n.status}${n.deleted ? ", deleted" : ""}]`
  switch (note.kind) {
    case "none":
      return "no next instance was minted with this check-off"
    case "derived":
      return (
        `next instance ${note.nextId} due ${note.dueDate}${tail(note)} WAS DERIVED from the shifted day; ` +
        `from the corrected day it would be ${note.correctedDueDate ?? "—"}. NOT rewritten.`
      )
    case "not-derived":
      return (
        `next instance ${note.nextId} due ${note.dueDate}${tail(note)} is not the cadence from the recorded day ` +
        `(${note.fromRecorded ?? "no cadence"}) — an override, a roll-forward or an edit; nothing to report.`
      )
  }
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { home: homeId, apply, until } = parseArgs(process.argv.slice(2))
  const target = connect()
  const db = getFirestore()

  console.log(`\nrepair-completed-on — ${apply ? "APPLY (writing)" : "DRY RUN (no writes; --apply to write)"}`)
  console.log(`Target: ${target.label}`)

  const homeSnap = await db.doc(`homes/${homeId}`).get()
  if (!homeSnap.exists) die(`homes/${homeId} does not exist on this target.`)
  const rawTz = homeSnap.get("timezone")
  let timeZone = DEFAULT_HOME_TIMEZONE
  let tzNote = "(default — the home has none)"
  if (rawTz != null && rawTz !== "") {
    if (typeof rawTz !== "string" || !isKnownTimeZone(rawTz)) {
      die(`homes/${homeId}.timezone is ${JSON.stringify(rawTz)}, which is not a timezone. Refusing to guess.`)
    }
    timeZone = rawTz
    tzNote = ""
  }
  console.log(`Home:   ${homeId} "${homeSnap.get("name") ?? ""}" · timezone ${timeZone} ${tzNote}`.trimEnd())
  if (until) console.log(`Until:  only check-offs before ${until.toISOString()}`)

  const instSnap = await db.collection(`homes/${homeId}/taskInstances`).get()
  const siblings: SiblingFacts[] = instSnap.docs.map((d) => ({
    id: d.id,
    taskTemplateId: d.get("taskTemplateId"),
    createdAt: asDate(d.get("createdAt")),
    dueDate: d.get("dueDate"),
    status: d.get("status"),
    deleted: d.get("deletedAt") != null,
  }))

  const counts: Record<RowVerdict["kind"] | "after-until", number> = {
    "not-completed": 0,
    deleted: 0,
    "other-writer": 0,
    consistent: 0,
    shifted: 0,
    unverifiable: 0,
    "after-until": 0,
  }
  const shifted: Array<{ doc: (typeof instSnap.docs)[number]; verdict: Extract<RowVerdict, { kind: "shifted" }> }> = []
  const unverifiable: Array<{ id: string; title: string; verdict: Extract<RowVerdict, { kind: "unverifiable" }> }> = []

  for (const doc of instSnap.docs) {
    const verdict = classifyCompletedRow(
      {
        status: doc.get("status"),
        deleted: doc.get("deletedAt") != null,
        completedAt: asDate(doc.get("completedAt")),
        updatedAt: asDate(doc.get("updatedAt")),
      },
      timeZone,
    )
    if (verdict.kind === "shifted" && until && verdict.checkedOffAt.getTime() >= until.getTime()) {
      counts["after-until"]++
      continue
    }
    counts[verdict.kind]++
    if (verdict.kind === "shifted") shifted.push({ doc, verdict })
    if (verdict.kind === "unverifiable") unverifiable.push({ id: doc.id, title: String(doc.get("title") ?? ""), verdict })
  }

  const done = instSnap.size - counts["not-completed"]
  console.log(`\nScanned ${instSnap.size} task instances, ${done} completed:`)
  console.log(`  shifted — recorded a day off the home's calendar:   ${counts.shifted}${apply ? "" : "  (would repair)"}`)
  console.log(`  consistent:                                        ${counts.consistent}`)
  console.log(`  unverifiable — back-dated, or written again since: ${counts.unverifiable}  (left alone)`)
  console.log(`  not written by completeTask (completedAt ≠ 12:00Z): ${counts["other-writer"]}  (left alone)`)
  console.log(`  soft-deleted:                                      ${counts.deleted}  (left alone)`)
  if (until) console.log(`  shifted-looking but at/after --until:              ${counts["after-until"]}  (left alone)`)

  // Templates of the shifted rows, for "was the next due date derived from it?"
  const templateIds = [...new Set(shifted.map((s) => String(s.doc.get("taskTemplateId") ?? "")))].filter(Boolean)
  const templates = new Map<string, DocumentData | undefined>()
  for (const id of templateIds) templates.set(id, (await db.doc(`homes/${homeId}/taskTemplates/${id}`).get()).data())

  let derivedCount = 0
  let applied = 0
  let skipped = 0
  if (shifted.length > 0) console.log(`\nSHIFTED`)
  for (const { doc, verdict } of shifted) {
    const templateId = doc.get("taskTemplateId")
    const note = describeNextDue(
      findNextInstance(siblings, templateId, doc.id, verdict.checkedOffAt),
      verdict.recorded,
      verdict.corrected,
      templates.get(String(templateId ?? ""))?.schedule,
    )
    if (note.kind === "derived") derivedCount++
    console.log(`  ${doc.id}  "${doc.get("title") ?? ""}"   ${verdict.recorded} → ${verdict.corrected}`)
    console.log(`      checked off ${verdict.checkedOffAt.toISOString()} (${homeClock(verdict.checkedOffAt, timeZone)} at the home)`)
    console.log(`      ${describeNext(note)}`)

    if (!apply) continue
    try {
      await doc.ref.update(
        {
          completedAt: Timestamp.fromDate(new Date(`${verdict.corrected}T12:00:00Z`)),
          completedOnRepair: {
            from: verdict.recorded,
            to: verdict.corrected,
            checkedOffAt: Timestamp.fromDate(verdict.checkedOffAt),
            repairedAt: FieldValue.serverTimestamp(),
            by: SCRIPT,
          },
        },
        { lastUpdateTime: doc.updateTime },
      )
      applied++
      console.log(`      ✓ completedAt moved to ${verdict.corrected}`)
    } catch (e) {
      skipped++
      console.error(`      ✖ NOT written (the row changed after it was read, or the write failed): ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  if (unverifiable.length > 0) {
    console.log(`\nUNVERIFIABLE (left alone)`)
    for (const u of unverifiable) {
      console.log(`  ${u.id}  "${u.title}"   recorded ${u.verdict.recorded}; last written ${u.verdict.lastWriteDay ?? "— (no updatedAt)"} at the home`)
    }
  }

  console.log(
    `\nTotals: ${counts.shifted} shifted · ${derivedCount} next due date(s) derived from a shifted day (reported, never rewritten)` +
      (apply ? ` · ${applied} written · ${skipped} not written` : ""),
  )
  console.log(apply ? "Applied.\n" : "Dry run only. Re-run with --apply to write completedAt for the SHIFTED rows above.\n")
  if (skipped > 0) process.exit(1)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
