/**
 * Storage security-rules tests.
 *
 * Everything under homes/{homeId}/… is membership-scoped for reads AND writes:
 * the rules call firestore.exists(homes/{homeId}/members/{uid}), a cross-service
 * lookup. Writes additionally keep their path shapes (own uid segment for
 * manuals/photos) and size caps. Legacy objects outside homes/ stay readable by
 * signed-in non-anonymous users (see storage.rules).
 *
 * WHERE THE MEMBERSHIP LOOKUP LOOKS — read this before trusting a red run. The
 * Storage emulator resolves firestore.exists() against the Firestore project
 * the emulator suite was STARTED with (`emulators:exec --project X`, which
 * exports X to the script as GCLOUD_PROJECT) — not this file's test projectId.
 * So membership docs are seeded THERE, through the Firestore emulator's REST
 * API as the owner (rules bypassed), and removed again in afterAll.
 *
 * Until 2026-09-30 this file said the emulator "does not resolve cross-service
 * firestore.exists()" and shipped the read-gate cases skipped. On the same
 * firebase-tools (15.23.0), under `npm run test:rules:emu` (--project
 * demo-homehub-rules, same as the seed) the member is admitted and the
 * outsider refused — the gate is exercised for real, and those cases run. The
 * old probe most likely ran against an emulator started under a different
 * project from the one it seeded, where the lookup finds nothing.
 *
 * Against an already-running emulator started with another project (the dev
 * emulator is demo-homehub), set GCLOUD_PROJECT to that project. The premise
 * check in beforeAll fails the whole file, with this explanation, if the
 * lookup is resolving somewhere else — a loud red instead of a false green.
 *
 * Requires the Storage + Firestore emulators:
 *   npm run test:rules:emu
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
import { ref, uploadBytes, deleteObject, getBytes, getDownloadURL, listAll } from "firebase/storage"

const __dirname = dirname(fileURLToPath(import.meta.url))

const HOME = "home-1"
/** A second, real home ME is NOT a member of (OTHER is). */
const HOME2 = "home-2"
const ME = "uid-me"
const OTHER = "uid-other"
/** A member of HOME whose token is anonymous-provider. */
const ANON_MEMBER = "anon-member-uid"
const BYTES = new Uint8Array([37, 80, 68, 70]) // "%PDF"
const PROBE = `homes/${HOME}/photos/${ME}/premise/probe.jpg`

let testEnv: RulesTestEnvironment

/** host:port from the emulator env var `emulators:exec` sets, else the default.
 *  Same reason as rules.test.ts: two emulator suites on one machine collide on
 *  the default ports, and a suite that silently talks to SOMEONE ELSE'S
 *  emulator is worse than one that fails to connect. */
function emulatorAt(envValue: string | undefined, fallback: string): { host: string; port: number } {
  const [host, port] = (envValue || fallback).split(":")
  return { host, port: Number(port) }
}
const FIRESTORE = emulatorAt(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8080")
/** The project the Storage emulator resolves firestore.exists() in (see top). */
const LOOKUP_PROJECT = process.env.GCLOUD_PROJECT || "demo-homehub-rules"
const MEMBERSHIPS: Array<[homeId: string, uid: string]> = [
  [HOME, ME],
  [HOME, ANON_MEMBER],
  [HOME2, OTHER],
]

/** Write or delete homes/{homeId}/members/{uid} in LOOKUP_PROJECT, as the
 *  emulator's owner (bypasses Firestore rules). */
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
  if (!res.ok) {
    throw new Error(`membership ${present ? "seed" : "cleanup"} ${homeId}/${uid} in ${LOOKUP_PROJECT}: HTTP ${res.status} ${await res.text()}`)
  }
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-homehub-rules",
    storage: {
      rules: readFileSync(resolve(__dirname, "../storage.rules"), "utf8"),
      ...emulatorAt(process.env.FIREBASE_STORAGE_EMULATOR_HOST, "127.0.0.1:9199"),
    },
    firestore: {
      rules: readFileSync(resolve(__dirname, "../firestore.rules"), "utf8"),
      ...FIRESTORE,
    },
  })
  for (const [homeId, uid] of MEMBERSHIPS) await membership(homeId, uid, true)

  // Premise: a member can read their own home. If this fails, every "member
  // may" case below would fail too — for a reason this file can name.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await uploadBytes(ref(ctx.storage(), PROBE), BYTES)
  })
  try {
    await getBytes(ref(testEnv.authenticatedContext(ME).storage(), PROBE))
  } catch (e) {
    throw new Error(
      `Premise failed: a MEMBER of ${HOME} was refused a read in it. Either the membership gate in ` +
        `storage.rules is broken, or the Storage emulator resolves firestore.exists() in a different ` +
        `project than ${LOOKUP_PROJECT} — it uses the project it was STARTED with, which emulators:exec ` +
        `exports as GCLOUD_PROJECT. Run \`npm run test:rules:emu\`, or set GCLOUD_PROJECT to the running ` +
        `emulator's --project. Cause: ${e instanceof Error ? e.message : String(e)}`,
    )
  }
})

afterAll(async () => {
  // Leave nothing behind in LOOKUP_PROJECT — it may be a shared dev emulator's.
  for (const [homeId, uid] of MEMBERSHIPS) await membership(homeId, uid, false)
  await testEnv?.cleanup()
})

const asMe = () => testEnv.authenticatedContext(ME).storage()
const asOther = () => testEnv.authenticatedContext(OTHER).storage()
const asAnon = () => testEnv.unauthenticatedContext().storage()
const asAnonMember = () =>
  testEnv.authenticatedContext(ANON_MEMBER, { firebase: { sign_in_provider: "anonymous" } }).storage()

describe("manual PDFs (homes/{homeId}/manuals/{userId}/…) — a member, own uid segment", () => {
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

  // B3: the path's uid segment was the ONLY check, so any account could write
  // under its own uid in a home it had never joined — any homeId string worked.
  it("a signed-in NON-member cannot write under their OWN uid segment in a foreign home", async () => {
    await assertFails(uploadBytes(ref(asOther(), `homes/${HOME}/manuals/${OTHER}/item1/manual_5.pdf`), BYTES))
  })

  it("a member of one home cannot write into another just by naming it", async () => {
    await assertFails(uploadBytes(ref(asMe(), `homes/${HOME2}/manuals/${ME}/item1/manual_6.pdf`), BYTES))
    await assertFails(uploadBytes(ref(asMe(), `homes/any-string-at-all/manuals/${ME}/item1/manual_7.pdf`), BYTES))
  })

  it("a non-member cannot delete, even under their own uid segment", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), `homes/${HOME}/manuals/${OTHER}/item1/left-behind.pdf`), BYTES)
    })
    await assertFails(deleteObject(ref(asOther(), `homes/${HOME}/manuals/${OTHER}/item1/left-behind.pdf`)))
  })
})

describe("photos (homes/{homeId}/photos/{userId}/…) — a member, own uid segment", () => {
  it("own segment allowed; other's segment denied", async () => {
    await assertSucceeds(uploadBytes(ref(asMe(), `homes/${HOME}/photos/${ME}/item1/photo.jpg`), BYTES))
    await assertFails(uploadBytes(ref(asOther(), `homes/${HOME}/photos/${ME}/item1/photo.jpg`), BYTES))
  })

  it("a signed-in NON-member cannot write under their OWN uid segment in a foreign home", async () => {
    await assertFails(uploadBytes(ref(asOther(), `homes/${HOME}/photos/${OTHER}/item1/photo.jpg`), BYTES))
  })
})

describe("receipts + diagram images — members only (no uid in path), never anonymous", () => {
  it("a member can write receipts/ and images/ in their home", async () => {
    await assertSucceeds(uploadBytes(ref(asMe(), `homes/${HOME}/receipts/item-9/123-receipt.jpg`), BYTES))
    await assertSucceeds(uploadBytes(ref(asMe(), `homes/${HOME}/images/manual-9/page_4.jpg`), BYTES))
  })

  // Was "any signed-in user can write receipts/ and images/ within a home" —
  // i.e. overwrite another home's diagram renders. Now refused.
  it("a signed-in NON-member cannot write receipts/ or images/ into someone else's home", async () => {
    await assertFails(uploadBytes(ref(asOther(), `homes/${HOME}/receipts/item-9/123-receipt.jpg`), BYTES))
    await assertFails(uploadBytes(ref(asOther(), `homes/${HOME}/images/manual-9/page_4.jpg`), BYTES))
  })

  it("unauthenticated cannot write them", async () => {
    await assertFails(uploadBytes(ref(asAnon(), `homes/${HOME}/receipts/item-9/x.jpg`), BYTES))
    await assertFails(uploadBytes(ref(asAnon(), `homes/${HOME}/images/manual-9/x.jpg`), BYTES))
  })
})

describe("anonymous-provider tokens never write, even with a membership row", () => {
  it("manuals, photos, receipts and images all refuse an anonymous member", async () => {
    await assertFails(uploadBytes(ref(asAnonMember(), `homes/${HOME}/manuals/${ANON_MEMBER}/i/m.pdf`), BYTES))
    await assertFails(uploadBytes(ref(asAnonMember(), `homes/${HOME}/photos/${ANON_MEMBER}/i/p.jpg`), BYTES))
    await assertFails(uploadBytes(ref(asAnonMember(), `homes/${HOME}/receipts/i/r.jpg`), BYTES))
    await assertFails(uploadBytes(ref(asAnonMember(), `homes/${HOME}/images/m/page_1.jpg`), BYTES))
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
 * The membership READ gate. Shipped skipped until 2026-09-30 on the belief the
 * emulator could not resolve the cross-service call; it can (see the top of
 * this file), so these run. The premise check in beforeAll guarantees the
 * "member may" case is not failing for the wrong reason, and the "outsider may
 * not" cases are paired with it so neither can pass vacuously.
 */
describe("tenant-scoped reads (membership of THIS home)", () => {
  beforeAll(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
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

// ── Package 1 (audit 2026-10-28): the two-account suite, extended ───────────
//
// Everything below runs against the LIVE storage.rules. The legacy-read case
// above stays exactly as it is: the live rule still grants it, and this file
// pins what is deployed. The post-cutover expectations ("legacy paths denied")
// live in storage.rules.post-migration.test.ts, against the proposed rules.

/** A member of HOME added and removed inside one test. */
const FORMER = "uid-former"
const asFormer = () => testEnv.authenticatedContext(FORMER).storage()

/** One object per supported family in each home, plus the migration's destination shape. */
const familyPaths = (homeId: string, uid: string) => [
  `homes/${homeId}/manuals/${uid}/iso-item/manual_1.pdf`,
  `homes/${homeId}/photos/${uid}/iso-item/photo.jpg`,
  `homes/${homeId}/receipts/iso-item/1-receipt.jpg`,
  `homes/${homeId}/images/iso-manual/page_1.jpg`,
  `homes/${homeId}/legacy/photos/${uid}/iso-item/photo.jpg`,
]

describe("two accounts, two homes — isolation in both directions, every family", () => {
  beforeAll(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      for (const p of [...familyPaths(HOME, ME), ...familyPaths(HOME2, OTHER)]) await uploadBytes(ref(ctx.storage(), p), BYTES)
    })
  })

  it("each reads its own home's files", async () => {
    for (const p of familyPaths(HOME, ME)) await assertSucceeds(getBytes(ref(asMe(), p)))
    for (const p of familyPaths(HOME2, OTHER)) await assertSucceeds(getBytes(ref(asOther(), p)))
  })

  it("neither reads the other's — getBytes or getDownloadURL — even with the exact path", async () => {
    for (const p of familyPaths(HOME2, OTHER)) {
      await assertFails(getBytes(ref(asMe(), p)))
      await assertFails(getDownloadURL(ref(asMe(), p)))
    }
    for (const p of familyPaths(HOME, ME)) {
      await assertFails(getBytes(ref(asOther(), p)))
      await assertFails(getDownloadURL(ref(asOther(), p)))
    }
  })

  it("neither writes into the other's home, in any family", async () => {
    await assertFails(uploadBytes(ref(asMe(), `homes/${HOME2}/manuals/${ME}/x/m.pdf`), BYTES))
    await assertFails(uploadBytes(ref(asMe(), `homes/${HOME2}/photos/${ME}/x/p.jpg`), BYTES))
    await assertFails(uploadBytes(ref(asMe(), `homes/${HOME2}/receipts/x/r.jpg`), BYTES))
    await assertFails(uploadBytes(ref(asMe(), `homes/${HOME2}/images/x/page_1.jpg`), BYTES))
    await assertFails(uploadBytes(ref(asOther(), `homes/${HOME}/receipts/x/r.jpg`), BYTES))
    await assertFails(uploadBytes(ref(asOther(), `homes/${HOME}/images/x/page_1.jpg`), BYTES))
  })

  it("nobody lists a home's files, member or not", async () => {
    await assertFails(listAll(ref(asMe(), `homes/${HOME}/photos/${ME}/iso-item`)))
    await assertFails(listAll(ref(asOther(), `homes/${HOME}/receipts`)))
  })
})

describe("a former member", () => {
  afterAll(async () => {
    await membership(HOME, FORMER, false)
  })

  it("reads and uploads while a member, and loses both the moment the membership row goes", async () => {
    const path = `homes/${HOME}/photos/${ME}/iso-item/photo.jpg`
    await membership(HOME, FORMER, true)
    await assertSucceeds(getBytes(ref(asFormer(), path)))
    await assertSucceeds(uploadBytes(ref(asFormer(), `homes/${HOME}/receipts/former/1-r.jpg`), BYTES))

    await membership(HOME, FORMER, false)
    await assertFails(getBytes(ref(asFormer(), path)))
    await assertFails(getDownloadURL(ref(asFormer(), path)))
    await assertFails(uploadBytes(ref(asFormer(), `homes/${HOME}/receipts/former/2-r.jpg`), BYTES))
    await assertFails(uploadBytes(ref(asFormer(), `homes/${HOME}/photos/${FORMER}/i/photo.jpg`), BYTES))
  })
})

describe("the app's supported flows: upload → getDownloadURL → plain fetch", () => {
  const flows: Array<[string, string, Record<string, string> | undefined]> = [
    // uploadManualPdf stamps the SHA-256 on custom metadata (HH-154).
    [`homes/${HOME}/manuals/${ME}/flow-item/manual_1.pdf`, "application/pdf", { sha256: "flow-sha" }],
    [`homes/${HOME}/photos/${ME}/flow-item/photo.jpg`, "image/jpeg", undefined],
    [`homes/${HOME}/receipts/flow-item/1-receipt.pdf`, "application/pdf", undefined],
  ]

  it("a member's upload comes back byte-for-byte through the token URL the app renders", async () => {
    for (const [path, contentType, customMetadata] of flows) {
      await assertSucceeds(uploadBytes(ref(asMe(), path), BYTES, { contentType, customMetadata }))
      const url = await assertSucceeds(getDownloadURL(ref(asMe(), path)))
      const res = await fetch(url)
      expect(res.status).toBe(200)
      expect(new Uint8Array(await res.arrayBuffer())).toEqual(BYTES)
    }
  })

  // Why the migration must think about token URLs at all: a download token is
  // a bearer capability. Anyone holding the URL reads the object with NO auth,
  // and storage.rules are never consulted. Revoking means removing the token.
  it("a download-token URL reads the object with no sign-in at all (rules are not consulted)", async () => {
    const [path] = flows[1]
    const url = await getDownloadURL(ref(asMe(), path))
    expect(new URL(url).searchParams.get("token")).toBeTruthy()
    await assertFails(getBytes(ref(asAnon(), path))) // the SDK read IS gated…
    expect((await fetch(url)).status).toBe(200) // …the token URL is not
  })
})

describe("migrated copies (homes/{homeId}/legacy/…, the migration's destination)", () => {
  const copy = `homes/${HOME}/legacy/receipts/item-1/old.jpg`
  beforeAll(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), copy), BYTES)
    })
  })

  it("members of that home read them; anyone else is refused", async () => {
    await assertSucceeds(getBytes(ref(asMe(), copy)))
    await assertFails(getBytes(ref(asOther(), copy)))
    await assertFails(getBytes(ref(asAnon(), copy)))
  })

  it("no client writes, overwrites or deletes them — not even a member", async () => {
    await assertFails(uploadBytes(ref(asMe(), copy), BYTES))
    await assertFails(uploadBytes(ref(asMe(), `homes/${HOME}/legacy/new/thing.jpg`), BYTES))
    await assertFails(deleteObject(ref(asMe(), copy)))
  })
})
