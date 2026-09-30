/**
 * Home membership roles: the vocabulary, and who may hand each one out.
 *
 * Pure and firebase-free (like shared/growth/inviteCode.ts) so the root vitest
 * run covers it, and so the client, the invite callables and the ops scan all
 * apply the SAME policy. firestore.rules cannot import it, so the rules restate
 * the two lists as literals — roles.test.ts fails if they drift.
 *
 * What a role actually DOES (read from firestore.rules, firebase/functions/src
 * and src/ on 2026-09-30): exactly one role carries power. `owner` gates member
 * management — hard-deleting the home, changing someone's role, removing
 * another member (removeMember), and the last-owner guard. Every other role
 * gets what any member gets: full read/write on the home's data
 * (docs/firestore-model.md §6). `admin` is a label inherited from v1's enum —
 * Settings prints "Admin" in a blue badge — and nothing anywhere checks it.
 */

export const HOME_ROLES = ["owner", "admin", "member", "guest"] as const
export type HomeRole = (typeof HOME_ROLES)[number]

/**
 * Roles ANY member may put on an invite. Non-privileged by construction.
 *
 * `admin` is deliberately not here even though it grants nothing today: it is
 * the one role whose name claims power, and the day someone gives it some, a
 * list that already let every member mint it would be an escalation nobody
 * re-reviewed. Owners may mint any HOME_ROLE (firestore.rules + acceptInvite).
 */
export const OPEN_INVITE_ROLES = ["member", "guest"] as const satisfies readonly HomeRole[]
export type OpenInviteRole = (typeof OPEN_INVITE_ROLES)[number]

/** What a new invite carries when nobody chooses — and what a refused role becomes. */
export const DEFAULT_INVITE_ROLE: OpenInviteRole = "member"

export function isHomeRole(value: unknown): value is HomeRole {
  return typeof value === "string" && (HOME_ROLES as readonly string[]).includes(value)
}

export function isOpenInviteRole(value: unknown): value is OpenInviteRole {
  return typeof value === "string" && (OPEN_INVITE_ROLES as readonly string[]).includes(value)
}

/**
 * The role an invite actually confers, decided at ACCEPT time.
 *
 * The rules refuse a non-owner WRITING a privileged invite, but the accept path
 * must not trust the stored field: invites written before those rules still
 * exist, and a creator can be demoted or removed after writing one. So the
 * creator's CURRENT role decides. Only an invite whose creator is an owner right
 * now may confer more than OPEN_INVITE_ROLES; anything else — a privileged role
 * from a non-owner, an unknown string, no role at all — becomes
 * DEFAULT_INVITE_ROLE rather than a refusal, because the person holding the
 * link did nothing wrong.
 */
export function effectiveInviteRole(requested: unknown, creatorRole: unknown): HomeRole {
  if (isOpenInviteRole(requested)) return requested
  if (creatorRole === "owner" && isHomeRole(requested)) return requested
  return DEFAULT_INVITE_ROLE
}
