import { LEGAL } from "@/pages/legal/legalConfig"

/**
 * One place that knows how to open a feedback email.
 *
 * It existed before, inline in Settings, which meant a confused user could only
 * report a problem by first finding Settings — and that the one moment they
 * most need it, a crashed screen, had no way to reach it at all. Extracted so
 * every entry point sends the same thing to the same address, and so adding the
 * next entry point costs a line.
 *
 * mailto rather than a `feedback` collection on purpose: a write to Firestore
 * cannot help when the failure being reported IS Firestore, or auth, or the
 * render that just threw. The user's mail app works when the app does not, and
 * it gives them a copy of what they sent.
 */

/** The address to show as text as well as link to. Some people prefer to type it. */
export const SUPPORT_EMAIL = LEGAL.contactEmail

export type FeedbackKind = "problem" | "idea" | "crash"

const SUBJECTS: Record<FeedbackKind, string> = {
  problem: "Homehub problem report",
  idea: "Homehub feedback",
  crash: "Homehub crashed",
}

const PROMPTS: Record<FeedbackKind, string[]> = {
  problem: ["What happened?", "", "", "What did you expect instead?", "", ""],
  idea: ["What would you like Homehub to do?", "", ""],
  // A crashed screen has already lost the user's place; asking them to
  // reconstruct the whole story is how a crash report becomes "it broke".
  crash: ["What were you doing when this happened?", "", ""],
}

/**
 * Device/build context, collected best-effort.
 *
 * Every lookup here is optional and individually guarded: this runs from the
 * error boundary, where the app is already broken, and a feedback button that
 * throws on the crash screen leaves the user with nothing at all.
 */
async function collectContext(extra?: Record<string, string | undefined>): Promise<string[]> {
  let build = "web"
  let platform = "web"
  try {
    const { Capacitor } = await import("@capacitor/core")
    platform = Capacitor.getPlatform()
    if (Capacitor.isNativePlatform()) {
      const { App } = await import("@capacitor/app")
      const info = await App.getInfo()
      build = `${info.version} (${info.build})`
    }
  } catch {
    /* context is a nicety — never block the report on collecting it */
  }

  const lines = [
    "— — — — —",
    "This part helps us find the problem — please leave it in.",
    `App: ${build} on ${platform}`,
    `Screen: ${typeof location !== "undefined" ? location.pathname : "unknown"}`,
    `Device: ${typeof navigator !== "undefined" ? navigator.userAgent : "unknown"}`,
    `When: ${new Date().toISOString()}`,
  ]
  for (const [k, v] of Object.entries(extra ?? {})) {
    if (v) lines.push(`${k}: ${v}`)
  }
  return lines
}

/** Build the `mailto:` URL. Exported separately so it is unit-testable. */
export function buildMailto(kind: FeedbackKind, bodyLines: string[]): string {
  return (
    `mailto:${SUPPORT_EMAIL}` +
    `?subject=${encodeURIComponent(SUBJECTS[kind])}` +
    `&body=${encodeURIComponent(bodyLines.join("\n"))}`
  )
}

/** Open the user's mail app with the subject and context already filled in. */
export async function openFeedback(
  kind: FeedbackKind = "problem",
  extra?: Record<string, string | undefined>,
): Promise<void> {
  const body = [...PROMPTS[kind], ...(await collectContext(extra))]
  window.location.href = buildMailto(kind, body)
}
