import { titleSimilarity, TITLE_MATCH_THRESHOLD } from "../../shared/parse/parseCore.js"

/**
 * Pair golden titles with new titles, best-scoring pairs first.
 *
 * The old loop walked the golden list in order and let each entry claim the
 * best still-unclaimed new title. That is order-dependent: an early golden
 * could take a title a later golden matched far better, orphaning the later one
 * as MISSING and leaving the loose title as "added" — one real rename showing
 * up as a drop AND an addition. On the furnace corpus that manufactured pairs
 * of phantom regressions and is why its golden kept "rotting".
 *
 * Scoring every pair and assigning in descending score order removes the
 * ordering dependency entirely: the strongest pair wins, then the next
 * strongest among what remains. Ties break on index so runs are reproducible.
 *
 * NOT a fix to `titleSimilarity` — that matcher is fine and shared with prod
 * reconciliation (non-negotiable #1). Verified: the pairs this was flagging,
 * including "High Altitude" vs "High-Altitude", score 0.60–1.00, comfortably
 * above the 0.5 threshold. The scoring was never the problem; the assignment
 * was.
 */
export function pairByBestScore(
  golden: string[],
  next: string[],
): { pairs: Array<[number, number]>; unmatchedGolden: number[]; unmatchedNext: number[] } {
  const scored: Array<{ g: number; n: number; s: number }> = []
  golden.forEach((g, gi) => {
    next.forEach((t, ni) => {
      const s = titleSimilarity(g, t)
      if (s >= TITLE_MATCH_THRESHOLD) scored.push({ g: gi, n: ni, s })
    })
  })
  scored.sort((a, b) => b.s - a.s || a.g - b.g || a.n - b.n)

  const usedG = new Set<number>()
  const usedN = new Set<number>()
  const pairs: Array<[number, number]> = []
  for (const { g, n } of scored) {
    if (usedG.has(g) || usedN.has(n)) continue
    usedG.add(g); usedN.add(n)
    pairs.push([g, n])
  }
  return {
    pairs,
    unmatchedGolden: golden.map((_, i) => i).filter((i) => !usedG.has(i)),
    unmatchedNext: next.map((_, i) => i).filter((i) => !usedN.has(i)),
  }
}

