/**
 * Rescan audit snapshot — dumps an item's parse-derived state so a before/after
 * diff shows exactly what a rescan's reconciliation did (matched / flagged /
 * inserted / deleted, history preserved). Read-only.
 *
 * Usage:
 *   node scripts/parse-eval/snapshot-item.mjs "FoodCycler" before
 *   node scripts/parse-eval/snapshot-item.mjs "FoodCycler" after
 * Writes scripts/parse-eval/results/snapshot-<name>-<label>.json
 */
import { createClient } from "@supabase/supabase-js"
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const env = Object.fromEntries(
  readFileSync(join(HERE, "..", "..", ".env"), "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const [displayName, label] = process.argv.slice(2)
if (!displayName || !label) {
  console.error('Usage: node snapshot-item.mjs "<item display name>" <before|after>')
  process.exit(1)
}

const { data: items } = await sb.from("item_unit")
  .select("item_unit_id, display_name, home_id")
  .ilike("display_name", displayName)
if (!items || items.length !== 1) {
  console.error(`Expected exactly 1 item matching "${displayName}", found ${items?.length ?? 0}:`,
    (items ?? []).map((i) => i.display_name).join(", "))
  process.exit(1)
}
const item = items[0]

const { data: manuals } = await sb.from("manual_document")
  .select("manual_id, source_type, parsed_at")
  .eq("item_unit_id", item.item_unit_id)

const { data: tasks } = await sb.from("task_template")
  .select("task_template_id, title, external_key, manual_id, metadata, care_type, priority_tier, risk_level, schedule_rule(schedule_type, interval_days), estimated_minutes, source_page, justification, steps, instructions_override, care_type_overridden_at, is_active, deleted_at, created_at, updated_at")
  .eq("item_unit_id", item.item_unit_id)
  .eq("source", "manual")

const taskIds = (tasks ?? []).map((t) => t.task_template_id)
const { data: instances } = taskIds.length
  ? await sb.from("task_instance")
      .select("task_instance_id, task_template_id, status, due_date, completed_at, deleted_at")
      .in("task_template_id", taskIds)
  : { data: [] }

const manualIds = (manuals ?? []).map((m) => m.manual_id)
const { data: chunks } = manualIds.length
  ? await sb.from("knowledge_chunk")
      .select("chunk_id, manual_id, chunk_type, title, deleted_at")
      .in("manual_id", manualIds)
  : { data: [] }

const { data: supplyLinks } = taskIds.length
  ? await sb.from("task_template_supply")
      .select("task_template_id, supply_item(name)")
      .in("task_template_id", taskIds)
  : { data: [] }

const snapshot = {
  takenAt: new Date().toISOString(),
  label,
  item,
  manuals,
  tasks,
  instances,
  chunks,
  supplyLinks,
}
mkdirSync(join(HERE, "results"), { recursive: true })
const file = join(HERE, "results", `snapshot-${displayName.toLowerCase().replace(/\s+/g, "-")}-${label}.json`)
writeFileSync(file, JSON.stringify(snapshot, null, 2))

const liveTasks = (tasks ?? []).filter((t) => !t.deleted_at)
const done = (instances ?? []).filter((i) => i.status === "done")
console.log(`Snapshot (${label}) → ${file}`)
console.log(`item: ${item.display_name} (${item.item_unit_id})`)
console.log(`manuals: ${(manuals ?? []).length} · tasks: ${liveTasks.length} live / ${(tasks ?? []).length} total · instances: ${(instances ?? []).length} (${done.length} done) · chunks: ${(chunks ?? []).filter((c) => !c.deleted_at).length} live`)
for (const t of liveTasks) {
  console.log(`  · ${t.title}  [key:${t.external_key ? "y" : "LEGACY"} steps:${Array.isArray(t.steps) ? t.steps.length : "-"} p.${t.source_page ?? "-"} just:${t.justification ? "y" : "-"} missed:${t.metadata?.missed_scans ?? 0}]`)
}
