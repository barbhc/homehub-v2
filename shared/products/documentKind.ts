/**
 * What KIND of document a search result actually is.
 *
 * HH-73 (owner, beta round 7): searching for an LG dryer manual offered
 * "DLEX3900-DLGX3901-Spec-Sheet.pdf" from lg.com, carrying our "manufacturer's
 * own site" badge. Every existing guard passed it — right brand, right host,
 * plausible model — and all of them were answering the wrong question. It is
 * not an owner's manual. It is a two-page sales sheet.
 *
 * That matters more here than in most products: the chosen PDF is fed to the
 * parser that writes the user's maintenance schedule. A spec sheet contains no
 * maintenance, so it parses into confident nonsense — the same failure as the
 * cover-page-only upload a tester hit in round 5, arriving by a different door.
 * And the reassurance badge makes it worse: the one signal telling them to trust
 * this result is attached to the document least able to earn it.
 *
 * Labels, never blocks. Sometimes a spec sheet is genuinely what someone wants,
 * and a manual whose filename happens to say "quick start" may still be the
 * full book. The user decides; we stop pretending we don't know.
 */

export type DocumentKind = "manual" | "spec" | "parts" | "quickstart" | "warranty" | "install"

/** Ordered: the first match wins, so the more specific patterns come first. */
const PATTERNS: { kind: DocumentKind; re: RegExp; label: string }[] = [
  { kind: "spec",       re: /\b(spec(ification)?s?[\s_-]*sheet|spec[\s_-]*sheet|product[\s_-]*spec)/i, label: "Spec sheet" },
  { kind: "parts",      re: /\b(parts?[\s_-]*(list|catalog(ue)?|diagram|manual)|exploded[\s_-]*view)/i, label: "Parts list" },
  { kind: "quickstart", re: /\b(quick[\s_-]*(start|setup|guide)|getting[\s_-]*started|setup[\s_-]*guide)/i, label: "Quick start" },
  { kind: "warranty",   re: /\bwarrant(y|ies)\b/i, label: "Warranty" },
  { kind: "install",    re: /\b(install(ation)?[\s_-]*(guide|manual|instructions))/i, label: "Install guide" },
]

/** An explicit owner's-manual claim outranks a stray word elsewhere in the name. */
const OWNERS_MANUAL = /\b(owner'?s?[\s_-]*manual|user[\s_-]*manual|use[\s_-]*and[\s_-]*care|instruction[\s_-]*manual)\b/i

export interface DocumentKindResult {
  kind: DocumentKind
  /** Short chip text, or null for a plain manual (nothing worth saying). */
  label: string | null
  /** True when this is unlikely to contain maintenance guidance at all. */
  thinOnUpkeep: boolean
}

/**
 * Classify from the title and URL — the only things we have before fetching.
 *
 * Defaults to "manual", because most results genuinely are one and an unlabelled
 * result should read as the normal case rather than an unknown.
 */
export function documentKind(title: string, url = ""): DocumentKindResult {
  const hay = `${title} ${url}`
  if (OWNERS_MANUAL.test(hay)) return { kind: "manual", label: null, thinOnUpkeep: false }
  for (const p of PATTERNS) {
    if (p.re.test(hay)) {
      // Parts lists and spec sheets carry no upkeep. A quick start or an
      // install guide may carry some, so they are labelled but not warned about.
      const thin = p.kind === "spec" || p.kind === "parts" || p.kind === "warranty"
      return { kind: p.kind, label: p.label, thinOnUpkeep: thin }
    }
  }
  return { kind: "manual", label: null, thinOnUpkeep: false }
}

/**
 * A display title for a result whose own title tells you nothing.
 *
 * partstown.com came back titled simply "Partstown" — the host, repeated. It
 * passed namesProduct because the MODEL was in the URL, which is correct as a
 * relevance test and useless as a label: the user is asked to choose between
 * documents by reading their names, and this one had none. Falls back to the
 * file name, which is at least about the document.
 */
/**
 * A title that is obviously machinery rather than words — the giveaway is
 * dotted lowercase segments with no spaces. A tester's manual search returned
 * a manufacturer page whose own <title> was the literal string
 * "seo.defaults.title": their site ships an untranslated placeholder, and we
 * printed it back at him. Not our bug, but very much our screen.
 */
function looksLikePlaceholderKey(t: string): boolean {
  return /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*){2,}$/.test(t.trim())
}

export function displayTitle(title: string, url: string, host: string): string {
  const t = title.trim()
  if (looksLikePlaceholderKey(t)) return host || t
  const bare = t.toLowerCase().replace(/[^a-z0-9]/g, "")
  const h = host.toLowerCase().replace(/^www\./, "").replace(/[^a-z0-9]/g, "")
  // EQUALITY, not prefix. "LG Owner's Manual" starts with the host "lg.com"
  // and is a perfectly good title; only a title that IS the host is useless.
  const hostNoTld = h.replace(/(com|org|net|co|io)$/, "")
  const looksLikeHost = bare.length > 0 && (bare === h || bare === hostNoTld)
  if (t && !looksLikeHost) return t
  try {
    const file = decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() ?? "")
    if (file) return file.replace(/\.(pdf|html?)$/i, "").replace(/[_+]/g, " ")
  } catch {
    // Unparseable URL — fall through to whatever we were given.
  }
  return t || host
}
