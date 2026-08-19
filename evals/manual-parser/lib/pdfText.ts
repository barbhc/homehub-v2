/**
 * Page-by-page text extraction, via the pdfjs-dist the app already depends on
 * (no new dependency, and no system binary — pdftotext is not installed here and
 * requiring one would make the eval un-runnable on a fresh machine).
 *
 * Used only by the human-facing `inspect` command. Scoring never reads the PDF:
 * it reads the model's output and the hand-authored expectations, so a change in
 * pdfjs cannot move a score.
 */
import { readFileSync } from "node:fs"

export async function extractText(pdfPath: string): Promise<string[]> {
  // Legacy build: the modern ESM entry expects browser globals.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
  const data = new Uint8Array(readFileSync(pdfPath))
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true, verbosity: 0 }).promise
  const pages: string[] = []
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    const content = await page.getTextContent()
    pages.push(
      content.items
        .map((it: unknown) => (it as { str?: string }).str ?? "")
        .join(" ")
        .replace(/[ \t]+/g, " "),
    )
  }
  return pages
}
