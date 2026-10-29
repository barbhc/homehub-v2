/**
 * THE RULE CUTOVER, tested before it ships. Not the live rules.
 *
 * By default this file loads firebase/storage.post-migration.rules — the
 * PROPOSED rules for after every legacy object has been migrated into
 * homes/{homeId}/… (docs/storage-legacy-migration.md). firebase.json deploys
 * storage.rules, which still grants signed-in reads of legacy paths; that is
 * pinned, unchanged, by storage.rules.test.ts.
 *
 *   STORAGE_LEGACY_CUTOVER=1 npm run test:rules:emu
 *
 * points this suite at the LIVE storage.rules instead. Today that run FAILS on
 * every "legacy path denied" case — correctly, because the live rule has not
 * changed. The cutover PR sets the flag (or replaces storage.rules with the
 * proposal), and these cases become the proof that it shipped.
 *
 * Membership lookups resolve in the project the emulator was started with —
 * same mechanism and caveats as the top of storage.rules.test.ts.
 */
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing"
import { deleteObject, getBytes, getDownloadURL, listAll, ref, uploadBytes } from "firebase/storage"

const __dirname = dirname(fileURLToPath(import.meta.url))
const LIVE = resolve(__dirname, "../storage.rules")
const PROPOSED = resolve(__dirname, "./storage.post-migration.rules")
const CUTOVER = process.env.STORAGE_LEGACY_CUTOVER === "1"
const UNDER_TEST = CUTOVER ? LIVE : PROPOSED

const HOME = "pm-home-1"
const HOME2 = "pm-home-2"
const ME = "pm-me"
const OTHER = "pm-other"
const FORMER = "pm-former"
const BYTES = new Uint8Array([37, 80, 68, 70]) // "%PDF"

function emulatorAt(envValue: string | undefined, fallback: string): { host: string; port: number } {
  const [host, port] = (envValue || fallback).split(":")
  return { host, port: Number(port) }
}
const FIRESTORE = emulatorAt(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8080")
const LOOKUP_PROJECT = process.env.GCLOUD_PROJECT || "demo-homehub-rules"
const MEMBERSHIPS: Array<[string, string]> = [
  [HOME, ME],
  [HOME2, OTHER],
]

async function membership(homeId: string, uid: string, present: boolean): Promise<void> {
  const url =
    `http://${FIRESTORE.host}:${FIRESTORE.port}/v1/projects/${LOOKUP_PROJECT}` +
    `/databases/(default)/documents/homes/${homeId}/members/${uid}`
  const res = await fetch(
    url,
    present
      ? {
          method: "PATCH",
          headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
          body: JSON.stringify({ fields: { uid: { stringValue: uid }, role: { stringValue: "member" } } }),
        }
      : { method: "DELETE", headers: { Authorization: "Bearer owner" } },
  )
  if (!res.ok) throw new Error(`membership ${present ? "seed" : "cleanup"} ${homeId}/${uid}: HTTP ${res.status} ${await res.text()}`)
}

let testEnv: RulesTestEnvironment

/** Legacy originals — the shapes v1 and pre-2026-08-18 v2 wrote. */
const LEGACY = [
  `${ME}/item1/manual_1.pdf`,
  "legacy-item/manual_old.pdf",
  `photos/${ME}/item1/photo.jpg`,
  "photos/item1/photo.jpg",
  "receipts/item-1/1-old.jpg",
  "images/man-1/page_1.jpg",
  "some/deep/unmatched/shape.bin",
]
/** Their migrated copies in HOME. */
const COPIES = LEGACY.map((p) => `homes/${HOME}/legacy/${p}`)
const LEGACY_TOKEN = "pm-legacy-token"

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-homehub-rules",
    storage: { rules: readFileSync(UNDER_TEST, "utf8"), ...emulatorAt(process.env.FIREBASE_STORAGE_EMULATOR_HOST, "127.0.0.1:9199") },
  })
  for (const [h, u] of MEMBERSHIPS) await membership(h, u, true)
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    for (const p of LEGACY) {
      await uploadBytes(ref(ctx.storage(), p), BYTES, { customMetadata: { firebaseStorageDownloadTokens: LEGACY_TOKEN } })
    }
    for (const p of COPIES) await uploadBytes(ref(ctx.storage(), p), BYTES)
    await uploadBytes(ref(ctx.storage(), `homes/${HOME}/photos/${ME}/item1/photo.jpg`), BYTES)
  })
  // Premise: a member reads their own home under the rules under test. If this
  // fails, every "denied" case below would pass for the wrong reason.
  await assertSucceeds(getBytes(ref(testEnv.authenticatedContext(ME).storage(), `homes/${HOME}/photos/${ME}/item1/photo.jpg`)))
})

afterAll(async () => {
  for (const [h, u] of [...MEMBERSHIPS, [HOME, FORMER] as [string, string]]) await membership(h, u, false)
  await testEnv?.cleanup()
})

const asMe = () => testEnv.authenticatedContext(ME).storage()
const asOther = () => testEnv.authenticatedContext(OTHER).storage()
const asFormer = () => testEnv.authenticatedContext(FORMER).storage()
const asAnon = () => testEnv.unauthenticatedContext().storage()

describe(`the proposal tracks the live rules (${CUTOVER ? "skipped: testing the live file" : "proposed file"})`, () => {
  it.skipIf(CUTOVER)("everything above the legacy clause is copied verbatim from storage.rules", () => {
    const live = readFileSync(LIVE, "utf8")
    const start = live.indexOf("service firebase.storage {")
    const end = live.indexOf("    // ---- legacy objects (uploaded before the re-key")
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const proposed = readFileSync(PROPOSED, "utf8")
    // If this fails, storage.rules changed and the proposal did not: carry the
    // change over (or regenerate the proposal) before reviewing the cutover.
    expect(proposed).toContain(live.slice(start, end).trimEnd())
    expect(proposed).not.toMatch(/allow get: if isUser\(\) && prefix != 'homes'/)
  })
})

describe(`after the cutover — legacy paths are denied to every client (${CUTOVER ? "LIVE storage.rules" : "PROPOSED rules"})`, () => {
  it("a signed-in member of the owning home cannot read a legacy original — by SDK or getDownloadURL", async () => {
    for (const p of LEGACY) {
      await assertFails(getBytes(ref(asMe(), p)))
      await assertFails(getDownloadURL(ref(asMe(), p)))
    }
  })

  it("nor can any other signed-in user, or an unauthenticated caller", async () => {
    for (const p of LEGACY) {
      await assertFails(getBytes(ref(asOther(), p)))
      await assertFails(getBytes(ref(asAnon(), p)))
    }
  })

  it("no client writes, deletes or lists there either", async () => {
    await assertFails(uploadBytes(ref(asMe(), `${ME}/item1/manual_2.pdf`), BYTES))
    await assertFails(uploadBytes(ref(asMe(), "receipts/item-1/2-new.jpg"), BYTES))
    await assertFails(deleteObject(ref(asMe(), `${ME}/item1/manual_1.pdf`))) // the old uid-scoped delete is gone
    await assertFails(listAll(ref(asMe(), "photos")))
  })

  it("migrated copies stay readable to that home's members only, and stay read-only", async () => {
    for (const p of COPIES) {
      await assertSucceeds(getBytes(ref(asMe(), p)))
      await assertFails(getBytes(ref(asOther(), p)))
      await assertFails(getBytes(ref(asAnon(), p)))
    }
    await assertFails(uploadBytes(ref(asMe(), COPIES[0]), BYTES))
    await assertFails(deleteObject(ref(asMe(), COPIES[0])))
  })

  it("the supported flows are unchanged: members upload and read every family; outsiders are refused", async () => {
    const paths = [
      `homes/${HOME}/manuals/${ME}/i/manual_1.pdf`,
      `homes/${HOME}/photos/${ME}/i/photo.jpg`,
      `homes/${HOME}/receipts/i/1-r.jpg`,
      `homes/${HOME}/images/m/page_1.jpg`,
    ]
    for (const p of paths) {
      await assertSucceeds(uploadBytes(ref(asMe(), p), BYTES))
      const url = await assertSucceeds(getDownloadURL(ref(asMe(), p)))
      expect((await fetch(url)).status).toBe(200)
      await assertFails(getBytes(ref(asOther(), p)))
    }
    await assertFails(uploadBytes(ref(asOther(), `homes/${HOME}/receipts/i/2-r.jpg`), BYTES))
  })

  it("a former member loses access when their membership row goes", async () => {
    await membership(HOME, FORMER, true)
    await assertSucceeds(getBytes(ref(asFormer(), COPIES[2])))
    await membership(HOME, FORMER, false)
    await assertFails(getBytes(ref(asFormer(), COPIES[2])))
  })

  // The residual exposure the rule CANNOT close: a token URL is a bearer
  // capability and never consults the rules. After the cutover, a token URL
  // someone already holds for a legacy original still works — until the
  // token is revoked or the original deleted (both owner decisions; see the
  // doc's "Token-bearing URLs").
  it("a download-token URL to a legacy original still reads it — revocation is a separate, owner-approved step", async () => {
    const r = ref(testEnv.unauthenticatedContext().storage(), LEGACY[2])
    const url = `http://${emulatorAt(process.env.FIREBASE_STORAGE_EMULATOR_HOST, "127.0.0.1:9199").host}:${
      emulatorAt(process.env.FIREBASE_STORAGE_EMULATOR_HOST, "127.0.0.1:9199").port
    }/v0/b/${r.bucket}/o/${encodeURIComponent(r.fullPath)}?alt=media&token=${LEGACY_TOKEN}`
    expect((await fetch(url)).status).toBe(200)
  })
})
