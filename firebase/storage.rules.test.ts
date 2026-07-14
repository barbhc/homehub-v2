/**
 * Storage security-rules tests (Wave 1 hardening).
 *
 * The old rules were catch-all `read: true; write: request.auth != null` — any
 * signed-in token (incl. anonymous, provider temporarily enabled) could
 * overwrite ANY object. New rules: public read everywhere (v1 parity for
 * imported objects + public download URLs), writes only via per-prefix blocks
 * (uid-scoped for manuals/photos), size-capped. The 50MB cap itself isn't
 * exercised here (it would need a >50MB buffer) — covered by review.
 *
 * Requires the Storage emulator:
 *   firebase emulators:exec --only firestore,storage --project demo-homehub-rules 'npm run test:rules'
 */
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { afterAll, beforeAll, describe, it } from "vitest"
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing"
import { ref, uploadBytes, deleteObject, getBytes } from "firebase/storage"

const __dirname = dirname(fileURLToPath(import.meta.url))

const ME = "uid-me"
const OTHER = "uid-other"
const BYTES = new Uint8Array([37, 80, 68, 70]) // "%PDF"

let testEnv: RulesTestEnvironment

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-homehub-rules",
    storage: {
      rules: readFileSync(resolve(__dirname, "../storage.rules"), "utf8"),
      host: "127.0.0.1",
      port: 9199,
    },
  })
})

afterAll(async () => {
  await testEnv?.cleanup()
})

const asMe = () => testEnv.authenticatedContext(ME).storage()
const asOther = () => testEnv.authenticatedContext(OTHER).storage()
const asAnon = () => testEnv.unauthenticatedContext().storage()

describe("manual PDFs ({userId}/{itemId}/file) — uid-scoped writes", () => {
  it("owner writes + deletes under their own uid prefix", async () => {
    await assertSucceeds(uploadBytes(ref(asMe(), `${ME}/item1/manual_1.pdf`), BYTES))
    await assertSucceeds(deleteObject(ref(asMe(), `${ME}/item1/manual_1.pdf`)))
  })

  it("another user cannot write into someone else's uid prefix", async () => {
    await assertFails(uploadBytes(ref(asOther(), `${ME}/item1/manual_2.pdf`), BYTES))
  })

  it("another user cannot delete someone else's manual", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), `${ME}/item1/manual_3.pdf`), BYTES)
    })
    await assertFails(deleteObject(ref(asOther(), `${ME}/item1/manual_3.pdf`)))
  })

  it("unauthenticated writes are denied", async () => {
    await assertFails(uploadBytes(ref(asAnon(), `${ME}/item1/manual_4.pdf`), BYTES))
  })
})

describe("photos (photos/{userId}/{itemId}/file) — uid-scoped writes", () => {
  it("own prefix allowed; other's prefix denied", async () => {
    await assertSucceeds(uploadBytes(ref(asMe(), `photos/${ME}/item1/photo.jpg`), BYTES))
    await assertFails(uploadBytes(ref(asOther(), `photos/${ME}/item1/photo.jpg`), BYTES))
  })
})

describe("receipts + diagram images — any authed (no uid in path), never anon-less", () => {
  it("any signed-in user can write receipts/ and images/", async () => {
    await assertSucceeds(uploadBytes(ref(asOther(), "receipts/item-9/123-receipt.jpg"), BYTES))
    await assertSucceeds(uploadBytes(ref(asOther(), "images/manual-9/page_4.jpg"), BYTES))
  })

  it("unauthenticated cannot write them", async () => {
    await assertFails(uploadBytes(ref(asAnon(), "receipts/item-9/x.jpg"), BYTES))
    await assertFails(uploadBytes(ref(asAnon(), "images/manual-9/x.jpg"), BYTES))
  })
})

describe("catch-all removal — unmatched shapes are write-denied", () => {
  it("root-level and deep unmatched paths cannot be written even signed-in", async () => {
    await assertFails(uploadBytes(ref(asMe(), "loose-file.pdf"), BYTES))
    await assertFails(uploadBytes(ref(asMe(), "a/b/c/d/e.pdf"), BYTES))
  })
})

describe("public read (v1 parity — imported objects at any shape keep resolving)", () => {
  it("anyone can read any existing object, even unauthenticated", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), "legacy-item/manual_old.pdf"), BYTES)
    })
    await assertSucceeds(getBytes(ref(asAnon(), "legacy-item/manual_old.pdf")))
  })
})
