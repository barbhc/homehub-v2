import { titleSimilarity, TITLE_MATCH_THRESHOLD, titleTokens } from "../shared/parse/parseCore.js"
const pairs: [string, string][] = [
  ["Install High Altitude Pressure Switches", "Install High-Altitude Pressure Switches"],
  ["Inspect Condensate Drain System", "Inspect and Clear Condensate Drain"],
  ["Inspect Vent and Combustion Air Pipes", "Inspect Vent and Combustion Air Terminations"],
  ["Schedule Annual Professional Furnace Inspection", "Annual Professional Furnace Inspection"],
  ["Test Rollout Switch Reset", "Reset Rollout Switch After Trip"],
  ["Verify Gas Piping Connections at Startup", "Perform Gas Piping Leak Check at Startup"],
  ["Verify Vent System Connections at Installation", "Verify Vent System Connections and Pitch"],
  ["Verify Input Rate and Temperature Rise at Startup", "Verify Furnace Input Rate"],
  ["Protect Condensate System from Freezing", "Inspect and Clear Condensate Drain"],
]
for (const [a, b] of pairs) {
  const s = titleSimilarity(a, b)
  const ok = s >= TITLE_MATCH_THRESHOLD ? "MATCH " : "MISS  "
  process.stdout.write(`${ok} ${s.toFixed(2)}  ${a.slice(0,42).padEnd(42)} | ${b.slice(0,42)}\n`)
}
process.stdout.write(`\nthreshold=${TITLE_MATCH_THRESHOLD}\n`)
process.stdout.write(`tokens A: ${[...titleTokens(pairs[0][0])].join(",")}\n`)
process.stdout.write(`tokens B: ${[...titleTokens(pairs[0][1])].join(",")}\n`)
process.exit(0)
