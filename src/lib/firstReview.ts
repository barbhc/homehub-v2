/**
 * Has this person ever been through a task review?
 *
 * Round 18. The review teaches the product's whole model in one screen — what
 * lands on a schedule, what notifies, what is only ever saved to the item page —
 * and until now it taught none of it. The owner hit that gap from the other
 * side: she read "nothing here will remind you" above three rows showing a
 * weekly cadence and could not tell what the app was going to do.
 *
 * So the first review a person ever opens carries a short explainer, against
 * real rows they can see, and never appears again.
 *
 * PER DEVICE, NOT PER ACCOUNT, and that is a deliberate trade rather than the
 * obvious answer. Keying on the uid would be more correct — two people sharing
 * a phone would each be taught once — but reading the uid means `useAuth`,
 * which THROWS outside an AuthProvider. That would make the review sheet
 * crash without auth context, for the sake of a three-line explainer. A
 * component whose job is reviewing tasks should not acquire a hard dependency
 * on the auth tree to decide whether to show a hint.
 *
 * What the trade costs: on a shared device, the second person does not see the
 * explainer. What it buys: the sheet renders anywhere, including in tests and
 * in any future surface that mounts it outside the app shell.
 *
 * localStorage rather than Firestore for the same reason in miniature: getting
 * this wrong shows a short explainer twice, which costs a tap. A Firestore read
 * costs a round trip on the critical path of a screen someone is waiting on.
 */
const KEY = "homehub:first-review-seen"

/** True the first time a review is opened on this device, false ever after. */
export function isFirstReview(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== "1"
  } catch {
    // Private mode or storage disabled. Showing the explainer is the safe
    // failure: an extra reminder of how notifications work beats silently
    // teaching nobody.
    return true
  }
}

/** Records that it's been seen. Safe to call more than once. */
export function markFirstReviewSeen(): void {
  try {
    window.localStorage.setItem(KEY, "1")
  } catch {
    // Nothing to do: they see it again next time, which is harmless.
  }
}
