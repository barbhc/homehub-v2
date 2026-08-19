/**
 * Dump a corpus manual's text, so expectations are written from what the manual
 * ACTUALLY says rather than from what an appliance of that class usually says.
 *
 * This matters more than it sounds. "The air purifier's pre-filter is washed
 * every 2 weeks" is a fact about one Coway model, and an expectation asserting
 * it for the wrong model turns the eval into a generator of false failures —
 * which is how a suite stops being trusted and then stops being run.
 *
 *   npx vite-node evals/manual-parser/inspect.ts -- --only=air-purifier-coway
 *   npx vite-node evals/manual-parser/inspect.ts -- --only=dryer-lg --grep="clean|filter|month"
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { EVAL_DIR } from "./lib/env.js"
import { extractText } from "./lib/pdfText.js"
import { cachedPath } from "./lib/pdf.js"

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=").slice(1).join("=")
const only = arg("only")
const grep = arg("grep")
if (!only) {
  console.error("--only=<corpus name> is required. See evals/manual-parser/corpus/corpus.json")
  process.exit(2)
}

const corpus = JSON.parse(readFileSync(join(EVAL_DIR, "corpus", "corpus.json"), "utf8"))
const m = corpus.manuals.find((x: { name: string }) => x.name === only)
if (!m) {
  console.error(`no corpus manual named "${only}". Known: ${corpus.manuals.map((x: { name: string }) => x.name).join(", ")}`)
  process.exit(2)
}

const pages = await extractText(cachedPath(m.manual_id))
const re = grep ? new RegExp(grep, "i") : null

console.log(`# ${m.appliance} — ${pages.length} pages\n`)
for (const [i, text] of pages.entries()) {
  if (re && !re.test(text)) continue
  console.log(`\n───── page ${i + 1} ─────`)
  console.log(text.trim())
}
process.exit(0)
