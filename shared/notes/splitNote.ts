/**
 * A note's heading, read — never stored (design/spares-and-notes.md §2).
 * Shared so the app's note rows and Ask's notes block read a note the same way.
 *
 * "Paint: Benjamin Moore Swiss Coffee" → heading "Paint", body the rest. A
 * colon must be followed by a space or the line's end, so a URL or a time
 * ("10:30") is not a heading. A short first line over more lines is one too.
 */
const HEADING = /^([^:\n]{1,40}):(?=\s|$)/

export function splitNote(content: string, title?: string | null): { heading: string | null; body: string } {
  const text = (content ?? "").trim()
  if (title?.trim()) return { heading: title.trim(), body: text }
  const [first, ...rest] = text.split("\n")
  const m = HEADING.exec(first)
  if (m) {
    const body = [first.slice(m[0].length).trim(), ...rest].join("\n").trim()
    return { heading: m[1].trim(), body }
  }
  if (rest.length > 0 && first.trim().length <= 60) return { heading: first.trim(), body: rest.join("\n").trim() }
  return { heading: null, body: text }
}
