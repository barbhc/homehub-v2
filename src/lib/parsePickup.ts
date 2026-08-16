/**
 * Handoff flag between the add-item wizard and the item page.
 *
 * The worker parses server-side, so leaving the wizard mid-parse is already
 * safe — but nothing TOLD the user that, and nothing on the item page picked
 * the result up (beta feedback: "parse seemed to fail when I left"). The flag
 * marks "this parse started in a wizard the user may have left" so the item
 * page knows a `done` stage is NEWS to show, not an old parse from weeks ago
 * (every previously-parsed manual sits at `done` forever).
 *
 * localStorage, not Firestore: it's per-device UI state — the person who
 * started the parse is the one who left the wizard.
 */

const KEY_PREFIX = "hh-parse-pickup:"

export function markParsePending(manualId: string): void {
  try {
    localStorage.setItem(KEY_PREFIX + manualId, String(Date.now()))
  } catch {
    // Storage full/blocked → the item page just won't show the pickup banner.
  }
}

export function clearParsePending(manualId: string): void {
  try {
    localStorage.removeItem(KEY_PREFIX + manualId)
  } catch {
    // ignore
  }
}

export function isParsePending(manualId: string): boolean {
  try {
    return localStorage.getItem(KEY_PREFIX + manualId) !== null
  } catch {
    return false
  }
}
