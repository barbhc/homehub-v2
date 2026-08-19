/**
 * Wipe the Firestore emulator between suites.
 *
 * Re-seeding is NOT a reset. `seed-emulator.ts` writes fixed document IDs, so a
 * reseed overwrites the fixture — but leaves behind anything a previous suite
 * CREATED. The e2e suite adds items and uploads photos, and when the a11y suite
 * then ran in the same emulator it scanned a Home page containing rows the
 * fixture never produces. (That did surface a genuine contrast bug, which is
 * fixed separately; it is still not a state this suite should reach by
 * accident.)
 *
 * The emulator's own wipe endpoint is the only thing that actually resets it.
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/ops/clear-emulator.mjs
 */
const host = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080"
const project = process.env.GCLOUD_PROJECT || "demo-homehub"
const url = `http://${host}/emulator/v1/projects/${project}/databases/(default)/documents`

const res = await fetch(url, { method: "DELETE" }).catch((e) => {
  console.error(`Could not reach the Firestore emulator at ${host}: ${e.message}`)
  process.exit(1)
})
if (!res.ok) {
  console.error(`Emulator wipe failed: HTTP ${res.status} ${await res.text()}`)
  process.exit(1)
}
console.log(`Firestore emulator cleared (${project} @ ${host})`)
