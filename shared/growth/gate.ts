/**
 * Is the invite-code gate ON?
 *
 * firestore.rules enforces this on home creation (growthGateOff/admitted). This
 * restates the same decision for everything that has to AGREE with the rules:
 * the onboarding screen deciding whether to show the code field, and the ops
 * scripts reporting the gate's state. Pure and firebase-free so the root vitest
 * run covers it.
 *
 * FAILS CLOSED. The gate is off only when config/growth exists AND holds
 * `inviteGateEnabled: false` — the boolean, exactly. A missing doc, a missing
 * field, or any other value means ON. It used to fail OPEN, so deleting or never
 * creating one config doc silently let every new account create a home, and a
 * home is what unlocks every paid function.
 */
export function growthGateOn(config: { exists: boolean; inviteGateEnabled?: unknown }): boolean {
  return !(config.exists && config.inviteGateEnabled === false)
}
