/**
 * Query-relevance ranking for chat chunk retrieval.
 *
 * v1 pulled chunks from the home's manuals in Firestore order until the budget
 * filled, so multi-manual homes only ever surfaced the first manuals' chunks —
 * the Furnace and everything after it were never read for a home-wide question
 * (see BACKLOG "Unscoped Ask isn't query-relevant"). This ranks candidate chunks
 * gathered across ALL in-scope manuals by keyword overlap with the question,
 * weighting curated metadata (item name, title, tags, scenarios, section) above
 * raw body text. Pure + deterministic; no embeddings required.
 */

const STOPWORDS = new Set([
  "how", "do", "does", "did", "me", "my", "we", "our", "you", "your", "the", "a", "an", "to", "is",
  "are", "be", "of", "and", "or", "for", "in", "on", "at", "with", "what", "when", "where", "why",
  "which", "who", "should", "can", "could", "would", "it", "its", "this", "that", "these", "those",
  "from", "by", "up", "out", "if", "about", "get", "got", "have", "has", "had", "need", "want",
  "please", "tell", "show", "help", "there", "here", "any", "some",
])

/** Distinct, meaningful (≥3 chars, non-stopword) lowercase terms from a question. */
export function queryTerms(q: string): string[] {
  return [...new Set(q.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOPWORDS.has(w)))]
}

export interface Scorable {
  /** Curated metadata (item name + title + tags + scenarios + section), lowercased. */
  strong: string
  /** Body text, lowercased. */
  body: string
}

/** 3 points per query term present in the curated metadata, 1 in the body. */
export function scoreChunk(terms: string[], c: Scorable): number {
  let s = 0
  for (const t of terms) {
    if (c.strong.includes(t)) s += 3
    if (c.body.includes(t)) s += 1
  }
  return s
}

/**
 * Top `limit` candidates by relevance to the question. Falls back to the given
 * order when the question has no scorable terms, or nothing matches — so a vague
 * question still returns chunks rather than nothing.
 */
export function rankChunks<T extends Scorable>(question: string, candidates: T[], limit: number): T[] {
  const terms = queryTerms(question)
  if (terms.length === 0) return candidates.slice(0, limit)
  const scored = candidates.map((c) => ({ c, s: scoreChunk(terms, c) }))
  if (scored.every((x) => x.s === 0)) return candidates.slice(0, limit)
  return scored
    .map((x, i) => ({ ...x, i })) // stable tiebreak on original order
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.c)
}
