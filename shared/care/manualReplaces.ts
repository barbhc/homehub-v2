/**
 * Which of a manual's tasks is the same job as a typical task she already
 * added from the care library (before-friends PR D).
 *
 * The review asks her, per matched row, "Replace" or "Keep Both"; the answer
 * travels with Save to `commitManualDraft` (`typicalChoices`) and is applied in
 * the same commit. Nothing here writes anything.
 *
 * Two ways to match, strongest first:
 *  - `archetype`: the row's own words name the same kind of job as the library
 *    entry (`archetypeByRule`, the library's classifier without its similarity
 *    fallback). Defaults to Replace.
 *  - `similarity`: the wording is close — `titleSimilarity >= TITLE_MATCH_THRESHOLD`,
 *    the SAME function and threshold `commitDraft` uses to decline a near-
 *    duplicate (non-negotiable 1). These are exactly the rows the server would
 *    otherwise drop at Save without a word. Defaults to Keep Both (D11):
 *    "Replace water inlet hoses" scores 0.67 against "Replace the water filter".
 *
 * One-to-one, greedy, strongest pair first — the shape of
 * `planTaskReconciliation`'s fuzzy pass: two rows never claim one typical task,
 * and one row never claims two.
 */
import { titleSimilarity, TITLE_MATCH_THRESHOLD } from "../parse/parseCore.js"
import { archetypeByRule, entryByKey } from "./library.js"

export interface TypicalTask {
  templateId: string
  title: string
  /** The library entry's key (`externalKey` minus `library:`). */
  libraryKey: string
}

export interface ReplaceMatch {
  /** Index into the `rowTitles` passed in — titles can repeat, indexes cannot. */
  rowIndex: number
  rowTitle: string
  typical: TypicalTask
  by: "archetype" | "similarity"
}

export type TypicalChoice = "replace" | "keep_both"

/** One answer as Save sends it (`commitManualDraft`'s `typicalChoices`). */
export interface TypicalChoiceEntry {
  /** The manual task's title, exactly as sent in `tasks`. */
  title: string
  templateId: string
  choice: TypicalChoice
}

/** D11: only a same-kind-of-job match is presumed to be a replacement. */
export const defaultChoiceFor = (by: ReplaceMatch["by"]): TypicalChoice => (by === "archetype" ? "replace" : "keep_both")

/**
 * Is this one pair a match at all, and how? The pairwise test the matcher is
 * built from — exported so `commitManualDraft` can refuse a choice whose row
 * and typical task do not match (a stale or forged answer) by the SAME rule
 * the review used to ask it.
 */
export function pairMatch(rowTitle: string, typical: Pick<TypicalTask, "title" | "libraryKey">): ReplaceMatch["by"] | null {
  const a = archetypeByRule(rowTitle)
  if (a !== null && a === (entryByKey(typical.libraryKey)?.archetype ?? null)) return "archetype"
  return titleSimilarity(rowTitle, typical.title) >= TITLE_MATCH_THRESHOLD ? "similarity" : null
}

export function matchManualToTypical(rowTitles: readonly string[], typical: readonly TypicalTask[]): ReplaceMatch[] {
  if (rowTitles.length === 0 || typical.length === 0) return []
  // By rule only (pairMatch): the similarity fallback inside archetypeOf
  // would turn a close-wording match into a same-job one and default it to Replace.
  const pairs: { i: number; j: number; by: ReplaceMatch["by"]; sim: number }[] = []
  for (let i = 0; i < rowTitles.length; i++) {
    for (let j = 0; j < typical.length; j++) {
      const by = pairMatch(rowTitles[i], typical[j])
      if (by) pairs.push({ i, j, by, sim: titleSimilarity(rowTitles[i], typical[j].title) })
    }
  }
  // Archetype before similarity, then the closer wording; ties keep input order.
  pairs.sort((x, y) => (x.by === y.by ? y.sim - x.sim : x.by === "archetype" ? -1 : 1))

  const usedRows = new Set<number>()
  const usedTypical = new Set<number>()
  const out: ReplaceMatch[] = []
  for (const p of pairs) {
    if (usedRows.has(p.i) || usedTypical.has(p.j)) continue
    usedRows.add(p.i)
    usedTypical.add(p.j)
    out.push({ rowIndex: p.i, rowTitle: rowTitles[p.i], typical: typical[p.j], by: p.by })
  }
  return out.sort((a, b) => a.rowIndex - b.rowIndex)
}
