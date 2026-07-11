/**
 * Changelog entries shown in the What's New banner.
 *
 * Add new entries at the TOP of the array. The banner shows only the first
 * (latest) entry. Each entry has a unique `version` string used to track
 * dismissal per user via user_preferences.
 */

export type WhatsNewEntry = {
  /** Unique version key — used to track dismissal. Use date-based ids like "2026-04-14" */
  version: string
  /** Short headline shown in the banner */
  title: string
  /** One-line summary shown when collapsed */
  summary: string
  /** Bullet points shown when expanded */
  items: string[]
}

export const WHATS_NEW_ENTRIES: WhatsNewEntry[] = [
  {
    version: "2026-04-14",
    title: "Smarter categories",
    summary: "Items now have structured categories with tailored maintenance rules.",
    items: [
      "9 item categories: Major Appliance, Small Appliance, Fixture, System, Structure, Outdoor, Furniture, Media, and Smart Home",
      "Each category has its own sub-types and detail fields (fuel type, filter size, finish, etc.)",
      "Task generation is now category-aware — small appliances get fewer, more relevant tasks",
      "Existing items keep working and can be upgraded to the new categories from the item detail page",
    ],
  },
]
