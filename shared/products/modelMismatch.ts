/**
 * Catching the near-miss model before its manual becomes someone's care plan.
 *
 * The junk-host filter removes results that have nothing to do with the
 * product. It cannot tell a Core 300 manual from a Core 300S manual — both are
 * on the manufacturer's own site, both name the brand, both look right. The
 * 300S is the smart variant: different controls, different guidance.
 *
 * That is the expensive failure. A wrong HOST is obvious and gets rejected by a
 * person in a second. A wrong VARIANT parses cleanly, produces confident tasks,
 * and gives the owner no way to trace back why their filter reminder is wrong.
 *
 * So: warn, never block. One manual genuinely does cover a family sometimes, and
 * refusing those would be the same mistake pointed the other way.
 */
import { normalizeModel, titleNamesModel } from "./modelVariants.js"

/**
 * The model this title actually names, when it differs from what was typed.
 * Returns null when the title names the typed model exactly, or when nothing
 * model-shaped is recognisable — silence beats a guess.
 */
export function findModelMismatch(title: string, typedModel: string): string | null {
  const typed = normalizeModel(typedModel)
  if (typed.length < 3) return null
  // Names it exactly (in any spelling) — nothing to warn about.
  if (titleNamesModel(title, typedModel)) return null

  // Look for a token that EXTENDS what was typed: "CORE300" → "CORE300S".
  // Joined forms and spaced forms both, since titles use either.
  const words = title.split(/\s+/).filter(Boolean)
  for (let i = 0; i < words.length; i++) {
    // One word ("WM4000HWAX"), or two ("Core 300S") — titles spell models both
    // ways. Keep the ORIGINAL spacing: the warning is read against the
    // nameplate on the appliance, so "Core 300S" is recognisable where
    // "Core300S" makes the reader do the comparison themselves.
    const spellings = i + 1 < words.length ? [words[i], `${words[i]} ${words[i + 1]}`] : [words[i]]
    for (const candidate of spellings) {
      const norm = normalizeModel(candidate)
      if (
        norm.startsWith(typed) &&
        norm.length > typed.length &&
        // A short extension is a variant suffix ("S", "SP", "HWA"). A long one
        // is a different token that happens to share a prefix.
        norm.length <= typed.length + 4
      ) {
        return candidate.replace(/[^\w-]+$/, "")
      }
    }
  }

  // HH-73: the extension search above only catches a title naming a LONGER
  // model ("Core 300" → "Core 300S"). The LG report was the other two shapes:
  // "DLEX3900-DLGX3901-Spec-Sheet.pdf" offered for a DLGX3901B names a SIBLING
  // (DLEX3900) and a TRUNCATION (DLGX3901), and both returned null — so a
  // document naming two models, neither of them yours, arrived unflagged.
  //
  // Same doctrine: report the closest model-shaped token so the reader can
  // compare it against the nameplate themselves. Still a warning, never a block
  // — a manual really does sometimes cover a family, and "DLGX3901" probably
  // does cover "DLGX3901B".
  const tokens = title.match(/[A-Za-z]{2,}[-\s]?\d{2,}[A-Za-z0-9]*/g) ?? []
  let best: { text: string; shared: number } | null = null
  for (const raw of tokens) {
    const norm = normalizeModel(raw)
    if (norm.length < 4 || norm === typed) continue
    let shared = 0
    while (shared < norm.length && shared < typed.length && norm[shared] === typed[shared]) shared++
    // Needs a real family resemblance, or it is some unrelated number in the
    // filename rather than a model at all.
    if (shared < 3) continue
    if (!best || shared > best.shared) best = { text: raw.trim().replace(/[^\w-]+$/, ""), shared }
  }
  return best ? best.text : null
}
