/**
 * Every value in the legal pages that is a BUSINESS decision rather than a
 * description of the code lives here, so the pages themselves stay factual and
 * the things only the owner can decide are in one greppable place.
 *
 * ⚠️ REVIEW BEFORE EXTERNAL TESTFLIGHT. Each `TODO` below is a claim being made
 * to users and to Apple. The retention windows in particular are commitments —
 * pick numbers you will actually honour, not aspirational ones.
 */
export const LEGAL = {
  /** Confirmed 2026-08-10. Sole operator, no entity yet — revisit if an LLC is
   *  formed, at which point this must become the entity's legal name. */
  controller: "Homehub",

  /** Confirmed 2026-08-10. Dedicated app mailbox, deliberately not the owner's
   *  personal address — this is published in the policy, given to Apple, and
   *  will attract scrapers. */
  contactEmail: "chiefhomeofficerapp@gmail.com",

  /** Confirmed 2026-08-10. Bump whenever either document materially changes. */
  effective: "10 August 2026",

  /** Confirmed 2026-08-10. Deletion is actioned manually from an email request
   *  today — there is no in-app "delete my account" button — so this window has
   *  to be one a human can actually meet. 30 days can be met by hand. */
  deletionWindow: "30 days",

  /** Confirmed 2026-08-10, and CORRECTED DOWN from 90 days. Firestore's
   *  point-in-time recovery is 7 days by default and no scheduled backups are
   *  configured on this project, so 90 days claimed a safety net that does not
   *  exist. 30 days is the outer bound a copy could survive; promising less
   *  than we might hold is the safe direction to err. */
  backupWindow: "30 days",

  /** Confirmed 2026-08-10 against the PostHog free-tier default. Sentry is NOT
   *  wired in production (no DSN in the live bundle), so it has been removed
   *  from the processor list rather than disclosed as receiving data it never
   *  sees. Re-check this string if a paid PostHog plan changes the default. */
  telemetryRetention: "12 months",

  /** Confirmed 2026-08-10 — owner is resident in California. */
  governingLaw: "the State of California, United States",
} as const
