/**
 * Which stored manual sources the server may fetch for a home (H3a §3).
 * Separate from storagePdf.ts so the parse core can check a source without
 * importing the Storage SDK.
 */

export interface ManualSource {
  sourceType: string
  sourceRef: string
}

/** Said when a manual's stored source is missing or not this home's to read. */
export const MANUAL_SOURCE_UNAVAILABLE = "We couldn't find this manual's file. Try adding the PDF again."

/**
 * A manual's stored source, if the server may fetch it FOR THIS HOME (H3a §3).
 *
 * Manual docs are member-writable, and the server reads Storage with admin
 * rights (storagePdf.ts), so a stored `sourceRef` is honoured only where the member could read
 * the object themselves under storage.rules: inside `homes/{thisHome}/`, or a
 * legacy path outside `homes/` (v1-era and seeded objects, which any
 * signed-in user may read). A ref into ANOTHER home's folder is refused: it
 * used to be downloaded, and then parsed into this home, ingested as chunks,
 * or read aloud by Ask. URL sources are unchanged — isAllowedUrl guards them
 * at fetch time. Null also covers a missing or non-text field.
 */
export function manualSource(homeId: string, sourceType: unknown, sourceRef: unknown): ManualSource | null {
  if (typeof sourceType !== "string" || typeof sourceRef !== "string" || sourceRef.length === 0) return null
  if (sourceType === "url") return { sourceType, sourceRef }
  if (sourceRef.startsWith("/")) return null
  if (sourceRef.startsWith("homes/") && !sourceRef.startsWith(`homes/${homeId}/`)) return null
  return { sourceType, sourceRef }
}
