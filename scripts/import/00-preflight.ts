/**
 * 00-preflight — verifies connectivity to BOTH ends and prints a source row
 * census + target emptiness check. Always read-only. Run this first.
 *
 *   npx tsx scripts/import/00-preflight.ts
 */
import { banner } from "./lib/env.js"
import { fetchAll, listAuthUsers } from "./lib/source.js"
import { db, auth } from "./lib/target.js"

const TABLES = [
  "profiles", "home", "home_members", "home_invite", "room", "item_unit",
  "manual_document", "knowledge_chunk", "manual_entity", "chat_faq",
  "task_template", "schedule_rule", "task_template_supply", "task_instance",
  "supply_item", "supply_option", "shopping_list_item", "cleaning_session",
  "cleaning_session_task", "care_note", "service_provider", "conversation",
  "conversation_message", "troubleshooting_case", "troubleshooting_step",
  "task_tier_change_log", "user_preferences",
]

async function main(): Promise<void> {
  banner("00-preflight")

  console.log("Source (v1 Supabase) census:")
  let total = 0
  for (const t of TABLES) {
    const rows = await fetchAll(t)
    if (rows.length) console.log(`  ${t.padEnd(26)} ${rows.length}`)
    total += rows.length
  }
  const users = await listAuthUsers()
  console.log(`  ${"auth.users".padEnd(26)} ${users.length}`)
  console.log(`  total data rows: ${total}\n`)

  console.log("Target (v2 Firebase) check:")
  const homes = await db().collection("homes").count().get()
  const authUsers = await auth().listUsers(1)
  console.log(`  homes present:     ${homes.data().count}`)
  console.log(`  any auth user:     ${authUsers.users.length > 0 ? "yes" : "no"}`)
  if (homes.data().count > 0) {
    console.log("\n  ⚠ Target already has homes. Import is idempotent (deterministic ids overwrite),")
    console.log("    but confirm you intend to re-import over existing data.")
  }
  console.log("\n✓ Preflight OK — both ends reachable.")
}

main().then(() => process.exit(0)).catch((e) => { console.error("\n✖ Preflight failed:", e); process.exit(1) })
