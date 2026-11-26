/**
 * What to call a person when the app may not know their name.
 *
 * Seventeen fixes (owner, 2026-11-25): sign-up asks for email and password
 * only, the same as the first-minute path, so a name is never guaranteed. The
 * name stays editable in Settings > Account and in Members. Every place that
 * shows someone's name goes through here, so "no name" reads the same way
 * everywhere and never as a wrong word ("Anyone" for a real assignee) or as the
 * app having lost track of someone ("Unknown").
 *
 * Another member's email is not readable from their profile (users/{uid}
 * carries only the name, by design), so the email fallback is for YOU only.
 */

export interface Who {
  /** This person is the signed-in user. */
  isSelf: boolean
  /** The signed-in user's own email; ignored for anyone else. */
  email?: string | null
}

const clean = (s: string | null | undefined): string => (typeof s === "string" ? s.trim() : "")

/** The name, else "You" for yourself, else "Member". */
export function personLabel(fullName: string | null | undefined, who: Who): string {
  return clean(fullName) || (who.isSelf ? "You" : "Member")
}

/**
 * Up to two initials. With no name: the first letter of your own email's local
 * part, else "" — the caller shows a person icon rather than a "?".
 */
export function personInitials(fullName: string | null | undefined, who: Who): string {
  const name = clean(fullName)
  if (name) {
    return name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()
  }
  const local = who.isSelf ? clean(who.email?.split("@")[0]) : ""
  return local ? local[0].toUpperCase() : ""
}
