/**
 * Storage security-rules tests (Wave 1 hardening + launch-readiness P0).
 *
 * Reads: `get` only, for signed-in NON-anonymous users — no public read, no
 * `list` (bucket enumeration) anywhere. Legacy/imported v1 objects at any path
 * shape stay gettable by signed-in users; anything rendered via plain <img>
 * uses token-bearing getDownloadURL URLs (see resolveStorageUrl). Writes only
 * via per-prefix blocks (uid-scoped for manuals/photos), size-capped. The 50MB
 * cap itself isn't exercised here (it would need a >50MB buffer) — covered by
 * review.
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
import { ref, uploadBytes, deleteObject, getBytes, getDownloadURL, listAll } from "firebase/storage"

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

describe("reads — signed-in get only (no public read, no anonymous, no list)", () => {
  beforeAll(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), "legacy-item/manual_old.pdf"), BYTES)
      await uploadBytes(ref(ctx.storage(), `photos/${ME}/item1/seeded.jpg`), BYTES)
    })
  })

  it("unauthenticated reads are denied everywhere", async () => {
    await assertFails(getBytes(ref(asAnon(), "legacy-item/manual_old.pdf")))
    await assertFails(getBytes(ref(asAnon(), `photos/${ME}/item1/seeded.jpg`)))
  })

  it("signed-in users can get objects at any shape (legacy v1 imports included)", async () => {
    await assertSucceeds(getBytes(ref(asMe(), "legacy-item/manual_old.pdf")))
    // Cross-uid get too: co-members render each other's uploads via paths from
    // membership-gated Firestore docs.
    await assertSucceeds(getBytes(ref(asOther(), `photos/${ME}/item1/seeded.jpg`)))
  })

  it("getDownloadURL works for signed-in users (token URLs feed <img>/<a>)", async () => {
    await assertSucceeds(getDownloadURL(ref(asMe(), `photos/${ME}/item1/seeded.jpg`)))
  })

  it("anonymous-provider tokens cannot read (throwaway uids stay locked out)", async () => {
    const anonProvider = testEnv
      .authenticatedContext("anon-uid", { firebase: { sign_in_provider: "anonymous" } })
      .storage()
    await assertFails(getBytes(ref(anonProvider, "legacy-item/manual_old.pdf")))
  })

  it("list is denied even signed-in (no bucket enumeration)", async () => {
    await assertFails(listAll(ref(asMe(), `photos/${ME}/item1`)))
    await assertFails(listAll(ref(asMe(), "")))
  })
})
