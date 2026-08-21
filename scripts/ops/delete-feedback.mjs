#!/usr/bin/env node
/**
 * Delete TestFlight feedback from App Store Connect — the tedious half of the
 * review loop, which is otherwise 76 clicks in a web UI.
 *
 * THE ONE THING THIS MUST NEVER DO is delete a report that still has open work
 * against it, because the report IS the record: the screenshot, the tester's
 * exact words, the build and device. Nothing recovers it. So the list of what
 * may go is not typed in or passed on the command line — it is DERIVED from
 * feedback/ledger.json, and only from items whose status is exactly
 * `awaiting-deletion`. Anything still `new` or `approved` is skipped by
 * construction, and the script refuses to run at all if the ledger is missing.
 *
 * Safety, in the order it matters:
 *   · dry run by default — --confirm is required to delete anything
 *   · --limit N to prove the call on ONE item before trusting it with 76
 *   · every id is cross-checked against the ledger immediately before its
 *     DELETE, so a stale plan cannot delete something decided since
 *   · a 404 counts as success (already gone), anything else stops the run
 *
 * Usage, from the project root:
 *   node scripts/ops/delete-feedback.mjs                 # dry run — prints the plan
 *   node scripts/ops/delete-feedback.mjs --limit 1 --confirm
 *   node scripts/ops/delete-feedback.mjs --confirm
 *
 * Needs ASC_KEY_ID / ASC_ISSUER_ID and ~/.appstoreconnect/private_keys/AuthKey_<ID>.p8:
 *   eval "$(grep -hE '^\s*export ASC_' ~/.zshrc)"
 */
import { readFileSync, writeFileSync } from "node:fs"
import { createPrivateKey, createSign } from "node:crypto"
import { homedir } from "node:os"

const args = process.argv.slice(2)
const CONFIRM = args.includes("--confirm")
const LIMIT = (() => {
  const i = args.indexOf("--limit")
  return i >= 0 && args[i + 1] ? Math.max(1, parseInt(args[i + 1], 10)) : Infinity
})()
const LEDGER = "feedback/ledger.json"

const KEY_ID = process.env.ASC_KEY_ID
const ISSUER = process.env.ASC_ISSUER_ID
if (!KEY_ID || !ISSUER) {
  console.error("Set ASC_KEY_ID and ASC_ISSUER_ID first:\n  eval \"$(grep -hE '^\\s*export ASC_' ~/.zshrc)\"")
  process.exit(1)
}
const p8 = createPrivateKey(readFileSync(`${homedir()}/.appstoreconnect/private_keys/AuthKey_${KEY_ID}.p8`))

function jwt() {
  const now = Math.floor(Date.now() / 1000)
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url")
  const head = b64({ alg: "ES256", kid: KEY_ID, typ: "JWT" })
  // Apple rejects provider tokens with a lifetime over 20 minutes.
  const body = b64({ iss: ISSUER, iat: now, exp: now + 900, aud: "appstoreconnect-v1" })
  const s = createSign("SHA256")
  s.update(`${head}.${body}`)
  // ieee-p1363 is mandatory — node's default DER signature gets an opaque 401.
  return `${head}.${body}.${s.sign({ key: p8, dsaEncoding: "ieee-p1363" }).toString("base64url")}`
}

async function del(id) {
  const res = await fetch(`https://api.appstoreconnect.apple.com/v1/betaFeedbackScreenshotSubmissions/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${jwt()}` },
  })
  // 204 = deleted. 404 = already gone, which is the same end state and must not
  // abort a run that is otherwise fine.
  if (res.status === 204 || res.status === 404) return res.status
  throw new Error(`${res.status} ${await res.text().catch(() => "")}`.slice(0, 300))
}

// ── the plan, derived from the ledger and nothing else ─────────────────────
let ledger
try {
  ledger = JSON.parse(readFileSync(LEDGER, "utf8"))
} catch {
  console.error(`Cannot read ${LEDGER}. Run this from the project root, after a review run.`)
  process.exit(1)
}

const entries = Object.entries(ledger.items)
const deletable = entries.filter(([, v]) => v.status === "awaiting-deletion" && v.ascId)
const keep = entries.filter(([, v]) => v.status !== "awaiting-deletion")

console.log(`Ledger: ${entries.length} items — ${deletable.length} deletable, ${keep.length} still open.\n`)
if (keep.length) {
  console.log("KEEPING (still open — never deleted by this script):")
  for (const [id, v] of keep) console.log(`  ${id}  ${v.status.padEnd(10)}  ${v.request ?? v.comment?.slice(0, 60) ?? ""}`)
  console.log()
}
if (!deletable.length) {
  console.log("Nothing to delete.")
  process.exit(0)
}

const plan = deletable.slice(0, LIMIT === Infinity ? deletable.length : LIMIT)
console.log(`${CONFIRM ? "DELETING" : "WOULD DELETE"} ${plan.length}${plan.length < deletable.length ? ` of ${deletable.length}` : ""}:`)
for (const [id, v] of plan) {
  console.log(`  ${id}  ${v.createdDate.slice(0, 10)}  ${(v.request ?? v.comment ?? "").replace(/\n/g, " ").slice(0, 68)}`)
}
console.log()

if (!CONFIRM) {
  console.log("Dry run. Nothing was deleted — this is permanent, so it needs --confirm.")
  console.log("Prove it on one first:  node scripts/ops/delete-feedback.mjs --limit 1 --confirm")
  process.exit(0)
}

let done = 0, gone = 0
for (const [id, v] of plan) {
  // Re-read the ledger's view of THIS id right before deleting it. A plan built
  // a minute ago must not delete something that has since been reopened.
  const current = JSON.parse(readFileSync(LEDGER, "utf8")).items[id]
  if (!current || current.status !== "awaiting-deletion") {
    console.log(`  ~ ${id} skipped — no longer marked for deletion`)
    continue
  }
  try {
    const status = await del(v.ascId)
    if (status === 404) gone++
    done++
    console.log(`  ${status === 404 ? "~" : "✓"} ${id}${status === 404 ? " (already gone)" : ""}`)
  } catch (e) {
    console.error(`  ✗ ${id} — ${e.message}`)
    console.error("\nStopped. Nothing after this point was touched.")
    process.exit(1)
  }
}

// Record it, so the next review run does not re-list what is already gone.
const fresh = JSON.parse(readFileSync(LEDGER, "utf8"))
const stamp = new Date().toISOString()
for (const [id] of plan) {
  if (fresh.items[id]?.status === "awaiting-deletion") {
    fresh.items[id].status = "deleted"
    fresh.items[id].deletion = { ...(fresh.items[id].deletion ?? {}), deletedAt: stamp, confirmedBy: "delete-feedback.mjs" }
  }
}
fresh.lastTouched = { by: "delete-feedback.mjs", at: stamp }
writeFileSync(LEDGER, JSON.stringify(fresh, null, 2))

console.log(`\nDeleted ${done - gone}, already gone ${gone}. Ledger updated.`)
