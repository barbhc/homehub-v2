/**
 * 40-reparse — re-extract every imported PRIMARY manual with the v2 parse worker
 * (new prompt: symptom tags, structured steps, the §5 denorm set). Imported
 * chunks/tasks are valid but were produced by the OLD v1 parser; this regenerates
 * them. Optional but recommended — it's the quality upgrade the v2 worker exists
 * for. (You can also do this per-manual from the app: Settings → Rescan all.)
 *
 * Mechanism: mints a custom token for OWNER_UID (Admin), exchanges it for an ID
 * token, then calls the deployed `enqueueParse` callable per manual — reusing the
 * real queue + in-flight cap + requestId claim path — and polls parse.stage to a
 * terminal state. Runs a few at a time to respect the worker's in-flight cap (5).
 *
 *   FIREBASE_WEB_API_KEY=<key> OWNER_UID=<uid> CONFIRM=IMPORT \
 *     npx tsx scripts/import/40-reparse.ts
 */
import { banner, DRY_RUN, requireEnv } from "./lib/env.js"
import { db, auth } from "./lib/target.js"

const REGION = process.env.FUNCTIONS_REGION ?? "us-central1"
const CONCURRENCY = 3 // < the worker's MAX_IN_FLIGHT (5)

async function idTokenFor(uid: string): Promise<string> {
  const apiKey = requireEnv("FIREBASE_WEB_API_KEY")
  const customToken = await auth().createCustomToken(uid)
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  })
  if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${await res.text().catch(() => "")}`)
  return (await res.json()).idToken as string
}

async function enqueue(idToken: string, projectId: string, homeId: string, manualId: string): Promise<void> {
  const res = await fetch(`https://${REGION}-${projectId}.cloudfunctions.net/enqueueParse`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ data: { homeId, manualId, mode: "commit" } }),
  })
  if (!res.ok) throw new Error(`enqueueParse ${manualId}: ${res.status} ${await res.text().catch(() => "")}`)
}

async function waitDone(homeId: string, manualId: string): Promise<"done" | "error" | "timeout"> {
  const ref = db().doc(`homes/${homeId}/manuals/${manualId}`)
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 5000))
    const stage = (await ref.get()).get("parse.stage")
    if (stage === "done") return "done"
    if (stage === "error") return "error"
  }
  return "timeout"
}

async function main(): Promise<void> {
  banner("40-reparse")
  const projectId = requireEnv("FIREBASE_PROJECT_ID")
  const ownerUid = requireEnv("OWNER_UID")

  // Every primary manual across all homes (collection-group over manuals).
  const snap = await db().collectionGroup("manuals").where("role", "==", "primary").get()
  const manuals = snap.docs
    .filter((d) => !d.get("deletedAt"))
    .map((d) => ({ homeId: d.ref.parent.parent!.id, manualId: d.id, title: d.get("title") }))
  console.log(`Found ${manuals.length} primary manual(s) to re-parse.`)

  if (DRY_RUN) {
    for (const m of manuals) console.log(`  would re-parse ${m.title} (${m.manualId})`)
    console.log(`\n(dry run) would re-parse ${manuals.length} manual(s).`)
    return
  }

  const idToken = await idTokenFor(ownerUid)
  let done = 0, failed = 0
  for (let i = 0; i < manuals.length; i += CONCURRENCY) {
    const batch = manuals.slice(i, i + CONCURRENCY)
    await Promise.all(batch.map(async (m) => {
      try {
        await enqueue(idToken, projectId, m.homeId, m.manualId)
        const r = await waitDone(m.homeId, m.manualId)
        if (r === "done") { done++; console.log(`  ✓ ${m.title}`) }
        else { failed++; console.warn(`  ✖ ${m.title}: ${r}`) }
      } catch (e) {
        failed++
        console.warn(`  ✖ ${m.title}: ${e instanceof Error ? e.message : e}`)
      }
    }))
  }
  console.log(`\n✓ re-parse: ${done} done, ${failed} failed/timeout (retry failures via Settings → Rescan).`)
}

main().then(() => process.exit(0)).catch((e) => { console.error("\n✖ Re-parse failed:", e); process.exit(1) })
