/**
 * The pure half of migrate-legacy-storage.ts: argument parsing, the
 * production guard, and the census formatting (counts and bytes only).
 * Firebase-free so the unit run gates the guard — the thing that decides
 * whether a run may touch production at all.
 */
import { redact, type MigrationPlan, type MigrationSummary, type Tally } from "./storageLegacyMigration.js"

export const PROD_PROJECT = "homehub-2068d"

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
  if (args.apply && args.homes.length === 0) {
    throw new Error("--apply in production needs --home <homeId> (one household at a time, each approved).")
  }
  return { kind: "production", project: args.project, bucket: args.bucket }
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
  return out
}

