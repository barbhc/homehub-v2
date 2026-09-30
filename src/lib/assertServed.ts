/**
 * Refuse to present an offline cache-miss as a real, empty result.
 *
 * Firestore's getDocs falls back to the LOCAL cache when it can't reach the
 * server, and resolves — no throw. On a device whose cache is cold that yields
 * an empty snapshot indistinguishable from "this home genuinely has nothing",
 * which is how a dropped connection rendered the new-user "Add your first item"
 * hero over a home with 14 items. `fromCache` is the only honest signal, so an
 * empty cache-served read is reported as the failure it is; SWR then keeps the
 * last good snapshot and the page shows it behind a "last saved view" note —
 * and, just as important, never persists the empty read as the new snapshot.
 */
export function assertServed(snap: { metadata: { fromCache: boolean }; empty: boolean }, what: string): void {
  if (snap.metadata.fromCache && snap.empty) {
    throw new Error(`Couldn't reach the server to load your ${what}.`)
  }
}
