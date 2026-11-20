/**
 * "4 cleaning tips, 1 usage tip and 2 setup steps" — what a manual left on an
 * item when none of it goes into Tasks. One phrasing for the two places that
 * say it: the hand-off card before "Keep these" (HH-137) and Upkeep after the
 * save (HH-161 S3c). Kinds with none are left out; "" when all are zero.
 */
export function upkeepKindsPhrase(n: { cleaning: number; usage: number; setup: number }): string {
  const parts = [
    n.cleaning > 0 ? `${n.cleaning} cleaning ${n.cleaning === 1 ? "tip" : "tips"}` : null,
    n.usage > 0 ? `${n.usage} usage ${n.usage === 1 ? "tip" : "tips"}` : null,
    n.setup > 0 ? `${n.setup} setup ${n.setup === 1 ? "step" : "steps"}` : null,
  ].filter((x): x is string => !!x)
  return parts.length < 2 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`
}
