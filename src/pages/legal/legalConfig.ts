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
  /** TODO(owner): confirm. "Homehub" alone is fine for a sole operator; if you
   *  form an LLC before launch this must become the entity's legal name. */
  controller: "Homehub",

  /** TODO(owner): confirm the address you want to receive privacy requests and
   *  App Store reviewer correspondence at. This becomes public. */
  contactEmail: "barb.chang@gmail.com",

  /** TODO(owner): confirm. Shown as "Effective <date>" on both pages; update it
   *  whenever either document materially changes. */
  effective: "31 July 2026",

  /** TODO(owner): confirm. How long after a delete request until the data is
   *  gone from live systems. 30 days is the common commitment. */
  deletionWindow: "30 days",

  /** TODO(owner): confirm against your actual Firestore backup retention. */
  backupWindow: "90 days",

  /** TODO(owner): confirm against PostHog and Sentry retention settings — those
   *  default to longer than most people assume, so check the dashboards rather
   *  than trusting this string. */
  telemetryRetention: "12 months",

  /** TODO(owner): confirm. Governs the Terms. Should be where you are actually
   *  resident or incorporated — California, per your locale. */
  governingLaw: "the State of California, United States",
} as const
