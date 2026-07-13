/**
 * 30-storage — copy the v1 Supabase Storage `Manuals` bucket into the v2 Firebase
 * Cloud Storage bucket, PRESERVING object paths so every stored reference
 * (manual.sourceRef, item.photoPath under `photos/`, item.receiptPath) keeps
 * resolving. v1 kept item photos under a `photos/` prefix in the same bucket
 * (see CLAUDE.md), so a full recursive copy covers manuals + photos + receipts.
 *
 *   FIREBASE_STORAGE_BUCKET=<bucket> CONFIRM=IMPORT npx tsx scripts/import/30-storage.ts
 */
import { banner, DRY_RUN } from "./lib/env.js"
import { source } from "./lib/source.js"
import { bucket } from "./lib/target.js"

const SRC_BUCKET = process.env.SOURCE_STORAGE_BUCKET ?? "Manuals"

/** Recursively list every object path under `prefix` in the source bucket. */
async function listAll(prefix = ""): Promise<string[]> {
  const storage = source().storage.from(SRC_BUCKET)
  const out: string[] = []
  const { data, error } = await storage.list(prefix, { limit: 1000, sortBy: { column: "name", order: "asc" } })
  if (error) throw new Error(`list ${prefix || "/"}: ${error.message}`)
  for (const entry of data ?? []) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name
    // A "folder" entry has no id/metadata; recurse into it.
    if (entry.id == null && entry.metadata == null) out.push(...(await listAll(path)))
    else out.push(path)
  }
  return out
}

async function main(): Promise<void> {
  banner("30-storage")
  console.log(`Source bucket: "${SRC_BUCKET}"  →  target: ${process.env.FIREBASE_STORAGE_BUCKET ?? "(default)"}\n`)

  const paths = await listAll()
  console.log(`Found ${paths.length} object(s).`)

  let copied = 0
  let skipped = 0
  for (const path of paths) {
    if (DRY_RUN) { console.log(`  would copy ${path}`); continue }
    const { data, error } = await source().storage.from(SRC_BUCKET).download(path)
    if (error || !data) { console.warn(`  · ${path}: download failed (${error?.message}) — skipping`); skipped++; continue }
    const buf = Buffer.from(await data.arrayBuffer())
    const contentType = data.type || (path.endsWith(".pdf") ? "application/pdf" : "application/octet-stream")
    await bucket().file(path).save(buf, { contentType, resumable: false })
    copied++
    if (copied % 10 === 0) console.log(`  … ${copied}/${paths.length}`)
  }

  console.log(DRY_RUN ? `\n(dry run) would copy ${paths.length} object(s).` : `\n✓ storage copy: ${copied} copied, ${skipped} skipped.`)
}

main().then(() => process.exit(0)).catch((e) => { console.error("\n✖ Storage import failed:", e); process.exit(1) })
