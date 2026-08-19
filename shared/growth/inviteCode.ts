/**
 * Invite-code policy: what a code looks like, and whether one may be redeemed.
 *
 * Pure and firebase-free so the root vitest run covers it, the same way
 * shared/quota/policy.ts is. The callable reads the doc and applies exactly
 * this, so the check and the increment cannot disagree.
 */

/**
 * Codes are stored and compared in this normalised form.
 *
 * Uppercased, and with the characters people reliably mistype removed: a code
 * is read off a phone screen or a text message and typed into another phone.
 * "homehub-2026" and "HOMEHUB2026" must be the same code, or the gate's main
 * effect is support email.
 */
export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "")
}

/**
 * One glyph from each confusable pair is dropped, not both — dropping both
 * costs alphabet size for nothing. Gone: O, I, L, S, B and the digits 0, 1, 5.
 * Kept: 8 (unambiguous once B is gone) and 2 (once Z... is not: Z stays, and
 * 2/Z is the one pair typed together rarely enough to keep both).
 */
const ALPHABET = "ACDEFGHJKMNPQRTUVWXYZ2346789"

/** A code the average person can read off one screen and type into another. */
export function generateCode(len = 8, rand: () => number = Math.random): string {
  let out = ""
  for (let i = 0; i < len; i++) out += ALPHABET[Math.floor(rand() * ALPHABET.length)]
  return out
}

export interface InviteCodeDoc {
  uses?: number
  maxUses?: number
  /** Epoch ms. Absent or null means it never expires. */
  expiresAt?: number | null
  disabled?: boolean
}

export type RedeemVerdict =
  | { ok: true }
  | { ok: false; reason: "unknown" | "disabled" | "expired" | "exhausted" | "malformed" }

/**
 * User-facing copy per verdict.
 *
 * "unknown", "disabled" and "expired" deliberately share one message. Telling
 * someone a code EXISTS but is expired confirms the code was real, which turns
 * guessing into a two-step oracle — and the person on the other end can do
 * nothing differently with the distinction anyway. "exhausted" is separate
 * because it IS actionable: their friend's code ran out and they should ask for
 * another.
 */
export function messageFor(reason: Exclude<RedeemVerdict, { ok: true }>["reason"]): string {
  switch (reason) {
    case "malformed":
      return "That doesn't look like an invite code — they're 8 letters and numbers."
    case "exhausted":
      return "That invite code has already been used as many times as it allows. Ask whoever shared it for a fresh one."
    default:
      return "That invite code isn't valid. Check for a typo, or ask whoever invited you for a new one."
  }
}

export function decideRedeem(code: string, doc: InviteCodeDoc | null, now: number): RedeemVerdict {
  if (normalizeCode(code).length < 4) return { ok: false, reason: "malformed" }
  if (!doc) return { ok: false, reason: "unknown" }
  if (doc.disabled === true) return { ok: false, reason: "disabled" }
  if (typeof doc.expiresAt === "number" && doc.expiresAt <= now) return { ok: false, reason: "expired" }
  // An absent maxUses means single-use, not unlimited. The safe direction for a
  // field somebody forgot to set on a code they minted by hand.
  const maxUses = typeof doc.maxUses === "number" && doc.maxUses > 0 ? doc.maxUses : 1
  const uses = typeof doc.uses === "number" && doc.uses > 0 ? doc.uses : 0
  if (uses >= maxUses) return { ok: false, reason: "exhausted" }
  return { ok: true }
}
