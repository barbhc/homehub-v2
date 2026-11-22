/**
 * Ids that tie a SegmentedControl to the panel it controls (WAI-ARIA tabs:
 * each tab `aria-controls` the panel; the panel is `role="tabpanel"`,
 * `aria-labelledby` the selected tab). One `base` per control — from useId,
 * so where a page mounts a phone tree and a desktop tree together, each
 * tree's control points at its own panel, never both at one id.
 */
export const segmentTabId = (base: string, value: string) => `${base}-tab-${value}`
export const segmentPanelId = (base: string) => `${base}-panel`

/** Spread on the container of the selected view's content. */
export function segmentPanelProps(base: string, selected: string) {
  return {
    role: "tabpanel" as const,
    id: segmentPanelId(base),
    "aria-labelledby": segmentTabId(base, selected),
  }
}
