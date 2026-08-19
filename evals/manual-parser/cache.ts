/**
 * Download every corpus PDF into .pdf-cache/ (idempotent).
 *
 * Split out from the run so a full eval is one network-free step once the cache
 * is warm, and so a broken corpus entry surfaces as "this manual is
 * unrecoverable" rather than as a mysterious mid-run failure that has already
 * cost API money on the manuals before it.
 *
 *   npx vite-node evals/manual-parser/cache.ts
 */
import { readFileSync } from "node:fs"
import { statSync } from "node:fs"
import { join } from "node:path"
import { EVAL_DIR } from "./lib/env.js"
import { cachedPath, isCached, loadPdfBase64, UnrecoverablePdf } from "./lib/pdf.js"

const corpus = JSON.parse(readFileSync(join(EVAL_DIR, "corpus", "corpus.json"), "utf8"))
let ok = 0
let failed = 0

for (const m of corpus.manuals) {
  if (isCached(m.manual_id)) {
    const mb = (statSync(cachedPath(m.manual_id)).size / 1e6).toFixed(1)
    console.log(`  cached   ${m.name.padEnd(22)} ${mb}MB`)
    ok++
    continue
  }
  try {
    await loadPdfBase64(m.home_id, m.manual_id)
    const mb = (statSync(cachedPath(m.manual_id)).size / 1e6).toFixed(1)
    console.log(`  fetched  ${m.name.padEnd(22)} ${mb}MB`)
    ok++
  } catch (e) {
    failed++
    const why = e instanceof UnrecoverablePdf ? e.message : String(e)
    console.error(`  FAILED   ${m.name.padEnd(22)} ${why}`)
  }
}

console.log(`\n${ok}/${corpus.manuals.length} corpus PDFs available${failed ? `, ${failed} unavailable` : ""}.`)
process.exit(failed ? 1 : 0)
