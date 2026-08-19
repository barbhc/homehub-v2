/**
 * Storage security-rules tests.
 *
 * Reads are tenant-scoped by path: new uploads live under homes/{homeId}/… and
 * reading one requires a membership doc in that home. Writes stay scoped by
 * path + uid (no Firestore lookup), which is what keeps them checkable here.
 *
 * EMULATOR LIMITATION — read the skipped block at the bottom before trusting a
 * green run: the Storage emulator does not resolve cross-service
 * firestore.exists() calls, so the membership gate itself cannot be exercised
 * locally. That was verified directly, not assumed: with an identical rule body
 * the member read is DENIED, and with the firestore call swapped for a plain
 * `request.auth != null` the same read SUCCEEDS. Those cases are written out and
 * skipped so they run the day the emulator supports it; until then the gate is
 * proven by the post-deploy smoke check in docs/launch-readiness.md.
 *
 * What IS covered here: the new home-scoped write shapes, the uid scoping within
 * them, the narrowed legacy prefixes, and the absence of a catch-all (an
 * unmatched shape must deny).
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
import { doc, setDoc } from "firebase/firestore"

const __dirname = dirname(fileURLToPath(import.meta.url))

const HOME = "home-1"
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
    // Needed to seed membership docs for the (currently skipped) tenant-read block.
    firestore: {
      rules: readFileSync(resolve(__dirname, "../firestore.rules"), "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  })
})

afterAll(async () => {
  await testEnv?.cleanup()
})

const asMe = () => testEnv.authenticatedContext(ME).storage()
const asOther = () => testEnv.authenticatedContext(OTHER).storage()
const asAnon = () => testEnv.unauthenticatedContext().storage()

describe("manual PDFs (homes/{homeId}/manuals/{userId}/…) — uid-scoped writes", () => {
  it("owner writes + deletes under their own uid segment", async () => {
    await assertSucceeds(uploadBytes(ref(asMe(), `homes/${HOME}/manuals/${ME}/item1/manual_1.pdf`), BYTES))
    await assertSucceeds(deleteObject(ref(asMe(), `homes/${HOME}/manuals/${ME}/item1/manual_1.pdf`)))
  })

  it("another user cannot write into someone else's uid segment", async () => {
    await assertFails(uploadBytes(ref(asOther(), `homes/${HOME}/manuals/${ME}/item1/manual_2.pdf`), BYTES))
  })

  it("another user cannot delete someone else's manual", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), `homes/${HOME}/manuals/${ME}/item1/manual_3.pdf`), BYTES)
    })
    await assertFails(deleteObject(ref(asOther(), `homes/${HOME}/manuals/${ME}/item1/manual_3.pdf`)))
  })

  it("unauthenticated writes are denied", async () => {
    await assertFails(uploadBytes(ref(asAnon(), `homes/${HOME}/manuals/${ME}/item1/manual_4.pdf`), BYTES))
  })
})

describe("photos (homes/{homeId}/photos/{userId}/…) — uid-scoped writes", () => {
  it("own segment allowed; other's segment denied", async () => {
    await assertSucceeds(uploadBytes(ref(asMe(), `homes/${HOME}/photos/${ME}/item1/photo.jpg`), BYTES))
    await assertFails(uploadBytes(ref(asOther(), `homes/${HOME}/photos/${ME}/item1/photo.jpg`), BYTES))
  })
})

describe("receipts + diagram images — any authed (no uid in path), never anonymous", () => {
  it("any signed-in user can write receipts/ and images/ within a home", async () => {
    await assertSucceeds(uploadBytes(ref(asOther(), `homes/${HOME}/receipts/item-9/123-receipt.jpg`), BYTES))
    await assertSucceeds(uploadBytes(ref(asOther(), `homes/${HOME}/images/manual-9/page_4.jpg`), BYTES))
  })

  it("unauthenticated cannot write them", async () => {
    await assertFails(uploadBytes(ref(asAnon(), `homes/${HOME}/receipts/item-9/x.jpg`), BYTES))
    await assertFails(uploadBytes(ref(asAnon(), `homes/${HOME}/images/manual-9/x.jpg`), BYTES))
  })
})

describe("no catch-all — unmatched shapes are write-denied", () => {
  it("root-level, deep, and legacy-prefix paths cannot be written even signed-in", async () => {
    await assertFails(uploadBytes(ref(asMe(), "loose-file.pdf"), BYTES))
    await assertFails(uploadBytes(ref(asMe(), "a/b/c/d/e.pdf"), BYTES))
    // The OLD un-scoped shapes are read-only now: nothing new may land there.
    await assertFails(uploadBytes(ref(asMe(), `${ME}/item1/manual.pdf`), BYTES))
    await assertFails(uploadBytes(ref(asMe(), `photos/${ME}/item1/photo.jpg`), BYTES))
    await assertFails(uploadBytes(ref(asMe(), "receipts/item-9/r.jpg"), BYTES))
  })

  it("a shape inside the home subtree that matches no write block is denied", async () => {
    await assertFails(uploadBytes(ref(asMe(), `homes/${HOME}/whatever.pdf`), BYTES))
    await assertFails(uploadBytes(ref(asMe(), `homes/${HOME}/exports/dump.zip`), BYTES))
  })
})

describe("legacy objects — still readable, but no longer covering homes/", () => {
  beforeAll(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), "legacy-item/manual_old.pdf"), BYTES)
      await uploadBytes(ref(ctx.storage(), `photos/${ME}/item1/seeded.jpg`), BYTES)
      await uploadBytes(ref(ctx.storage(), "receipts/item-1/old.jpg"), BYTES)
      await uploadBytes(ref(ctx.storage(), "images/man-1/page_1.jpg"), BYTES)
      await uploadBytes(ref(ctx.storage(), "some/deep/unmatched/shape.bin"), BYTES)
    })
  })

  it("unauthenticated reads are denied everywhere", async () => {
    await assertFails(getBytes(ref(asAnon(), "legacy-item/manual_old.pdf")))
    await assertFails(getBytes(ref(asAnon(), `photos/${ME}/item1/seeded.jpg`)))
  })

  it("signed-in users can still get legacy objects at ANY shape (v1 imports keep working)", async () => {
    // `legacy-item/manual_old.pdf` is two segments and matches none of the four
    // documented prefixes — which is exactly why the legacy clause stayed broad.
    await assertSucceeds(getBytes(ref(asMe(), "legacy-item/manual_old.pdf")))
    await assertSucceeds(getBytes(ref(asOther(), `photos/${ME}/item1/seeded.jpg`)))
    await assertSucceeds(getBytes(ref(asOther(), "receipts/item-1/old.jpg")))
    await assertSucceeds(getBytes(ref(asOther(), "images/man-1/page_1.jpg")))
    await assertSucceeds(getBytes(ref(asMe(), "some/deep/unmatched/shape.bin")))
  })

  it("the 3-segment legacy pattern does not leak the home subtree", async () => {
    // `/{userId}/{itemId}/{fileName}` would otherwise also match
    // homes/{homeId}/{file} and grant an un-scoped read inside the tenant space.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), `homes/${HOME}/leaked.pdf`), BYTES)
    })
    await assertFails(getBytes(ref(asOther(), `homes/${HOME}/leaked.pdf`)))
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

/**
 * The membership gate itself. SKIPPED, and not because it is unimportant — it is
 * the whole point of Finding 2. The Storage emulator does not resolve
 * cross-service firestore.exists(), so every case below fails locally for the
 * wrong reason (the call returns falsy, so even the MEMBER is denied and the
 * "outsider denied" assertions would pass vacuously — a false green, which is
 * worse than a skip).
 *
 * Verified by probe on this machine, firebase-tools 15.23.0:
 *   rule `firestore.exists(.../members/$(request.auth.uid))` → member DENIED
 *   rule `request.auth != null` (same path)                  → member ALLOWED
 *
 * Until the emulator supports it, the gate is proven by the post-deploy smoke
 * check in docs/launch-readiness.md, run against the real project.
 */
describe.skip("tenant-scoped reads (needs cross-service rules — see block comment)", () => {
  beforeAll(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `homes/${HOME}/members/${ME}`), { uid: ME, role: "owner" })
      await uploadBytes(ref(ctx.storage(), `homes/${HOME}/photos/${ME}/item1/photo.jpg`), BYTES)
    })
  })

  it("a member of the home can read its objects", async () => {
    await assertSucceeds(getBytes(ref(asMe(), `homes/${HOME}/photos/${ME}/item1/photo.jpg`)))
  })

  it("a signed-in NON-member cannot, even knowing the exact path", async () => {
    await assertFails(getBytes(ref(asOther(), `homes/${HOME}/photos/${ME}/item1/photo.jpg`)))
  })

  it("getDownloadURL is gated the same way (it is a read)", async () => {
    await assertSucceeds(getDownloadURL(ref(asMe(), `homes/${HOME}/photos/${ME}/item1/photo.jpg`)))
    await assertFails(getDownloadURL(ref(asOther(), `homes/${HOME}/photos/${ME}/item1/photo.jpg`)))
  })
})
