/**
 * Seed deterministic E2E test data into a Supabase project.
 *
 * Creates (or resets) ONE throwaway test user with an isolated home, then seeds
 * a small, curated, deterministic dataset that exercises the redesign surfaces:
 * rooms, items (with specs + warranty math), a calm mix of tasks (overdue / due
 * soon / later / seasonal), item-scoped cleaning steps (which must be FILTERED
 * out of the Tasks agenda — guards the data-binding regression), service
 * providers, saved Ask answers, and past conversations with cited answers.
 *
 * Safe to run against your DEV project: everything is scoped to the test user's
 * own home (named via TEST_HOME_NAME), wiped and re-seeded on each run, and never
 * touches other homes.
 *
 *   npm run seed:test          # uses .env.test
 *
 * Requires in .env.test:
 *   VITE_SUPABASE_URL (or SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY    # Settings → API → service_role (NEVER commit)
 *   TEST_USER_EMAIL / TEST_USER_PASSWORD  (optional; defaults in e2e/seed-config)
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import {
  SEED_TODAY,
  TEST_HOME_NAME,
  TEST_EMAIL,
  TEST_PASSWORD,
  dayOffset,
} from "../e2e/seed-config.js"

const URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!URL || !SERVICE_KEY) {
  console.error(
    "\n✖ Missing env. Add to .env.test:\n" +
      "    VITE_SUPABASE_URL=...\n" +
      "    SUPABASE_SERVICE_ROLE_KEY=...   (Supabase → Settings → API → service_role)\n" +
      "  then run:  npm run seed:test\n"
  )
  process.exit(1)
}

const db: SupabaseClient = createClient(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

/** Throws on any Supabase error so the seed fails loudly instead of half-seeding. */
function must<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`)
  return res.data
}

// ──────────────────────────────────────────────────────────────────────────
// 1. Test auth user (idempotent: reuse if already present, else create+confirm)
// ──────────────────────────────────────────────────────────────────────────
async function getOrCreateUser(): Promise<string> {
  // Try to create; if the email already exists, fall back to a paged lookup.
  const created = await db.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
  })
  if (!created.error && created.data.user) {
    console.log(`  · created test user ${TEST_EMAIL}`)
    return created.data.user.id
  }

  for (let page = 1; page <= 20; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error(`listUsers: ${error.message}`)
    const found = data.users.find((u) => u.email?.toLowerCase() === TEST_EMAIL.toLowerCase())
    if (found) {
      // Ensure the password + confirmation are in the known-good state.
      await db.auth.admin.updateUserById(found.id, {
        password: TEST_PASSWORD,
        email_confirm: true,
      })
      console.log(`  · reusing existing test user ${TEST_EMAIL}`)
      return found.id
    }
    if (data.users.length < 200) break
  }
  throw new Error(`Could not create or find test user ${TEST_EMAIL}`)
}

// ──────────────────────────────────────────────────────────────────────────
// 2. Home + membership (find-or-create the isolated test home)
// ──────────────────────────────────────────────────────────────────────────
async function getOrCreateHome(userId: string): Promise<string> {
  const existing = must(
    await db.from("home").select("home_id").eq("name", TEST_HOME_NAME).is("deleted_at", null),
    "select home"
  ) as { home_id: string }[]

  let homeId: string
  if (existing.length > 0) {
    homeId = existing[0].home_id
    console.log(`  · reusing test home ${homeId}`)
  } else {
    const home = must(
      await db
        .from("home")
        .insert({ name: TEST_HOME_NAME, timezone: "America/Los_Angeles" })
        .select("home_id")
        .single(),
      "insert home"
    ) as { home_id: string }
    homeId = home.home_id
    console.log(`  · created test home ${homeId}`)
  }

  await db
    .from("home_members")
    .upsert(
      { home_id: homeId, user_id: userId, role: "owner", is_primary: true },
      { onConflict: "home_id,user_id" }
    )

  return homeId
}

// ──────────────────────────────────────────────────────────────────────────
// 3. Wipe prior seeded child data for the test home (FK-safe order)
// ──────────────────────────────────────────────────────────────────────────
async function wipe(homeId: string): Promise<void> {
  const templates = (must(
    await db.from("task_template").select("task_template_id").eq("home_id", homeId),
    "select templates"
  ) as { task_template_id: string }[]).map((t) => t.task_template_id)

  // Conversations are tolerant of a missing table (migration may be unapplied):
  // Supabase resolves with an `error` object rather than rejecting, so we read
  // `.error` directly instead of using `must()`.
  const convoRes = await db.from("conversation").select("id").eq("home_id", homeId)
  const convos = (convoRes.error ? [] : (convoRes.data ?? [])) as { id: string }[]

  await db.from("task_instance").delete().eq("home_id", homeId)
  if (templates.length) await db.from("schedule_rule").delete().in("task_template_id", templates)
  await db.from("task_template").delete().eq("home_id", homeId)
  await db.from("chat_faq").delete().eq("home_id", homeId)
  if (convos.length) {
    await db.from("conversation_message").delete().in("conversation_id", convos.map((c) => c.id))
  }
  await db.from("conversation").delete().eq("home_id", homeId) // no-op if table absent
  await db.from("service_provider").delete().eq("home_id", homeId)
  await db.from("item_unit").delete().eq("home_id", homeId)
  await db.from("room").delete().eq("home_id", homeId)
  console.log("  · wiped prior seeded data")
}

// ──────────────────────────────────────────────────────────────────────────
// 4. Rooms
// ──────────────────────────────────────────────────────────────────────────
async function seedRooms(homeId: string): Promise<Record<string, string>> {
  const names = ["Kitchen", "Laundry Room", "Living Room", "Garage", "Bathroom"]
  const rows = must(
    await db
      .from("room")
      .insert(names.map((name) => ({ home_id: homeId, name })))
      .select("room_id, name"),
    "insert rooms"
  ) as { room_id: string; name: string }[]
  return Object.fromEntries(rows.map((r) => [r.name, r.room_id]))
}

// ──────────────────────────────────────────────────────────────────────────
// 5. Items (specs via category_fields; warranty via purchase_date + months)
// ──────────────────────────────────────────────────────────────────────────
async function seedItems(
  homeId: string,
  rooms: Record<string, string>
): Promise<Record<string, string>> {
  const items = [
    {
      key: "dishwasher",
      display_name: "Bosch 800 Series Dishwasher",
      category: "dishwasher",
      item_category: "major_appliance",
      brand: "Bosch",
      model: "SHPM88Z75N",
      room_id: rooms["Kitchen"],
      purchase_date: dayOffset(-400),
      warranty_duration_months: 24, // active
      category_fields: { Capacity: "16 place settings", "Noise level": "42 dBA", "Energy use": "269 kWh/yr" },
    },
    {
      key: "fridge",
      display_name: "LG French Door Refrigerator",
      category: "refrigerator",
      item_category: "major_appliance",
      brand: "LG",
      model: "LRFVS3006S",
      room_id: rooms["Kitchen"],
      purchase_date: dayOffset(-800),
      warranty_duration_months: 12, // lapsed
      category_fields: { Capacity: "30 cu ft", Type: "French door", "Ice maker": "Dual" },
    },
    {
      key: "furnace",
      display_name: "Carrier Infinity Furnace",
      category: "furnace",
      item_category: "system",
      brand: "Carrier",
      model: "59MN7",
      room_id: rooms["Garage"],
      purchase_date: dayOffset(-1200),
      warranty_duration_months: 120, // active (10yr)
      category_fields: { Stages: "Modulating", AFUE: "98.5%", Fuel: "Natural gas" },
    },
    {
      key: "washer",
      display_name: "Whirlpool Front-Load Washer",
      category: "washer",
      item_category: "major_appliance",
      brand: "Whirlpool",
      model: "WFW9620HC",
      room_id: rooms["Laundry Room"],
      purchase_date: dayOffset(-200),
      warranty_duration_months: 12, // active
      category_fields: { Capacity: "5.0 cu ft", "Spin speed": "1300 RPM" },
    },
    {
      key: "waterheater",
      display_name: "Rheem Performance Water Heater",
      category: "water_heater",
      item_category: "system",
      brand: "Rheem",
      model: "XE50T10",
      room_id: rooms["Garage"],
      purchase_date: dayOffset(-1500),
      warranty_duration_months: 72, // active (6yr)
      category_fields: { Capacity: "50 gal", "First-hour rating": "62 gal" },
    },
    {
      key: "range",
      display_name: "GE Profile Gas Range",
      category: "range",
      item_category: "major_appliance",
      brand: "GE",
      model: "PGB960",
      room_id: rooms["Kitchen"],
      purchase_date: dayOffset(-90),
      warranty_duration_months: 12, // active
      category_fields: { Burners: "5", "Oven capacity": "5.6 cu ft", "Convection": "Yes" },
    },
  ]

  const rows = must(
    await db
      .from("item_unit")
      .insert(
        items.map((it) => ({
          home_id: homeId,
          room_id: it.room_id,
          display_name: it.display_name,
          category: it.category,
          item_category: it.item_category,
          brand: it.brand,
          model: it.model,
          status: "active",
          purchase_date: it.purchase_date,
          warranty_duration_months: it.warranty_duration_months,
          category_fields: it.category_fields,
          recall_status: "none_found",
          recall_checked_at: new Date(`${SEED_TODAY}T00:00:00Z`).toISOString(),
        }))
      )
      .select("item_unit_id, display_name"),
    "insert items"
  ) as { item_unit_id: string; display_name: string }[]

  const byName = Object.fromEntries(rows.map((r) => [r.display_name, r.item_unit_id]))
  return Object.fromEntries(items.map((it) => [it.key, byName[it.display_name]]))
}

// ──────────────────────────────────────────────────────────────────────────
// 6. Tasks: template + schedule_rule + instance(s)
// ──────────────────────────────────────────────────────────────────────────
type TaskSeed = {
  title: string
  scope: "home" | "item_unit"
  itemKey?: string
  care: "cleaning" | "maintenance" | "mixed"
  tier: "essential" | "recommended" | "optional"
  risk: "safety" | "prevent_damage" | "performance" | "comfort"
  minutes: number
  schedule: "weekly" | "monthly" | "quarterly" | "semiannual" | "annual" | "seasonal" | "every_n_days"
  season?: "spring" | "summer" | "fall" | "winter"
  intervalDays?: number
  dueOffset: number
  status?: "scheduled" | "done"
  safety?: boolean
  justification?: string
}

async function seedTasks(
  homeId: string,
  items: Record<string, string>
): Promise<void> {
  const tasks: TaskSeed[] = [
    // ── Maintenance + home cleaning: these SHOULD appear in the Tasks agenda ──
    { title: "Replace HVAC furnace filter", scope: "item_unit", itemKey: "furnace", care: "maintenance", tier: "essential", risk: "prevent_damage", minutes: 10, schedule: "monthly", dueOffset: -5, justification: "A clogged filter strains the blower and cuts efficiency." },
    { title: "Test smoke & CO detectors", scope: "home", care: "maintenance", tier: "essential", risk: "safety", minutes: 10, schedule: "semiannual", dueOffset: -2, safety: true, justification: "Working detectors are your first warning in a fire or CO leak." },
    { title: "Flush the water heater", scope: "item_unit", itemKey: "waterheater", care: "maintenance", tier: "recommended", risk: "prevent_damage", minutes: 45, schedule: "annual", dueOffset: 4, justification: "Sediment buildup shortens tank life and raises energy use." },
    { title: "Service AC before summer", scope: "item_unit", itemKey: "furnace", care: "maintenance", tier: "recommended", risk: "performance", minutes: 60, schedule: "seasonal", season: "summer", dueOffset: 6, justification: "A pre-season check keeps cooling reliable through the heat." },
    { title: "Vacuum refrigerator coils", scope: "item_unit", itemKey: "fridge", care: "maintenance", tier: "recommended", risk: "performance", minutes: 20, schedule: "semiannual", dueOffset: 12, justification: "Dusty coils make the compressor work harder." },
    { title: "Clean range-hood filter", scope: "home", care: "cleaning", tier: "optional", risk: "performance", minutes: 15, schedule: "monthly", dueOffset: 2 },
    { title: "Wipe down kitchen surfaces", scope: "home", care: "cleaning", tier: "optional", risk: "comfort", minutes: 10, schedule: "weekly", dueOffset: 1 },

    // ── Completed, for "done" counts / Activity ──
    { title: "Run washer cleaning cycle", scope: "item_unit", itemKey: "washer", care: "cleaning", tier: "recommended", risk: "performance", minutes: 15, schedule: "monthly", dueOffset: -10, status: "done" },

    // ── Item-scoped CLEANING: these MUST be filtered OUT of the Tasks agenda ──
    //    (they belong on the item's cleaning guides). They guard the
    //    flatten-the-dataset regression: the Tasks list must NOT show them.
    { title: "Clean oven door glass", scope: "item_unit", itemKey: "range", care: "cleaning", tier: "optional", risk: "comfort", minutes: 15, schedule: "quarterly", dueOffset: 3 },
    { title: "Descale the dishwasher", scope: "item_unit", itemKey: "dishwasher", care: "cleaning", tier: "recommended", risk: "performance", minutes: 30, schedule: "monthly", dueOffset: 8 },
    { title: "Wipe refrigerator shelves", scope: "item_unit", itemKey: "fridge", care: "cleaning", tier: "optional", risk: "comfort", minutes: 20, schedule: "monthly", dueOffset: 9 },
  ]

  for (const t of tasks) {
    const itemId = t.itemKey ? items[t.itemKey] : null
    const template = must(
      await db
        .from("task_template")
        .insert({
          home_id: homeId,
          scope_type: t.scope,
          item_unit_id: itemId,
          title: t.title,
          care_type: t.care,
          priority_tier: t.tier,
          risk_level: t.risk,
          estimated_minutes: t.minutes,
          source: "cho_generated",
          is_active: true,
          justification: t.justification ?? null,
        })
        .select("task_template_id")
        .single(),
      `insert template "${t.title}"`
    ) as { task_template_id: string }

    await db.from("schedule_rule").insert({
      task_template_id: template.task_template_id,
      schedule_type: t.schedule,
      interval_days: t.intervalDays ?? null,
      season: t.season ?? null,
      anchor_date: SEED_TODAY,
    })

    await db.from("task_instance").insert({
      home_id: homeId,
      task_template_id: template.task_template_id,
      item_unit_id: itemId,
      status: t.status ?? "scheduled",
      due_date: dayOffset(t.dueOffset),
      is_safety_critical: t.safety ?? false,
      priority_score: t.tier === "essential" ? 100 : t.tier === "recommended" ? 50 : 10,
      completed_at: t.status === "done" ? new Date(`${dayOffset(t.dueOffset)}T17:00:00Z`).toISOString() : null,
    })
  }
  console.log(`  · seeded ${tasks.length} tasks (incl. 3 item-cleaning that must stay out of the agenda)`)
}

// ──────────────────────────────────────────────────────────────────────────
// 7. Service providers (the redesign's 4 seeded categories)
// ──────────────────────────────────────────────────────────────────────────
async function seedProviders(homeId: string): Promise<void> {
  await db.from("service_provider").insert([
    { home_id: homeId, name: "Ace Heating & Air", category: "hvac", phone: "(415) 555-0142", email: "service@aceheatingair.com", website: "https://aceheatingair.com", notes: "Installed the Carrier furnace. Ask for Marco for the annual tune-up." },
    { home_id: homeId, name: "Pro Plumb", category: "plumbing", phone: "(415) 555-0188", email: "dispatch@proplumb.com", website: "https://proplumb.com", notes: "Same-day for leaks. Flat $95 diagnostic." },
    { home_id: homeId, name: "Bright Spark Electric", category: "electrical", phone: "(415) 555-0119", email: "hello@brightspark.com", website: "https://brightspark.com", notes: "Licensed + insured. Did the panel upgrade in 2024." },
    { home_id: homeId, name: "Sears Appliance Repair", category: "appliance", phone: "(800) 555-4663", email: null, website: "https://searshomeservices.com", notes: "Covers the LG fridge and Whirlpool washer." },
  ])
  console.log("  · seeded 4 service providers")
}

// ──────────────────────────────────────────────────────────────────────────
// 8. Saved Ask answers (chat_faq)
// ──────────────────────────────────────────────────────────────────────────
async function seedFaqs(homeId: string, items: Record<string, string>): Promise<void> {
  await db.from("chat_faq").insert([
    { home_id: homeId, item_unit_id: items["dishwasher"], question: "How do I descale my Bosch dishwasher?", answer: "Run a hot cycle with a dishwasher descaler (or 2 cups of white vinegar in a bowl on the top rack) once a month in hard-water areas. Bosch recommends a dedicated descaling product to protect the seals." },
    { home_id: homeId, item_unit_id: items["furnace"], question: "What furnace filter size do I need?", answer: "The Carrier Infinity takes a 20x25x5 media filter. Replace it every 3 months, or monthly if you have pets." },
  ])
  console.log("  · seeded 2 saved answers")
}

// ──────────────────────────────────────────────────────────────────────────
// 9. Past conversations with cited answers (best-effort: needs the
//    chat_conversations migration applied; degrades gracefully if not)
// ──────────────────────────────────────────────────────────────────────────
async function seedConversations(
  homeId: string,
  userId: string,
  items: Record<string, string>
): Promise<void> {
  const convos = [
    {
      title: "Descale Bosch dishwasher",
      user: "How do I descale my Bosch dishwasher?",
      assistant:
        "Run a monthly descaling cycle: place a Bosch-approved descaler (or a bowl of white vinegar) on the top rack and run the hottest cycle empty. This clears limescale from the spray arms and heater.",
      sources: [
        { source_type: "manual", item_name: "Bosch 800 Series Dishwasher", title: "Care & cleaning · p.38" },
      ],
    },
    {
      title: "HVAC filter size",
      user: "What size filter does my furnace take?",
      assistant:
        "Your Carrier Infinity uses a 20x25x5 media filter. Swap it every 3 months. I added a recurring 'Replace HVAC furnace filter' task so you don't have to track it.",
      sources: [
        { source_type: "manual", item_name: "Carrier Infinity Furnace", title: "Maintenance · p.12" },
      ],
    },
    {
      title: "Fridge water tastes off",
      user: "The water from my LG fridge tastes off — what should I check?",
      assistant:
        "That's almost always the water filter. The LG LRFVS3006S uses an LT1000P filter; replace it every 6 months. Run 2.5 gallons through after installing to clear carbon fines.",
      sources: [
        { source_type: "manual", item_name: "LG French Door Refrigerator", title: "Water filter · p.21" },
      ],
    },
  ]

  try {
    for (const c of convos) {
      const conv = must(
        await db
          .from("conversation")
          .insert({ home_id: homeId, user_id: userId, title: c.title })
          .select("id")
          .single(),
        "insert conversation"
      ) as { id: string }
      await db.from("conversation_message").insert([
        { conversation_id: conv.id, role: "user", content: c.user, sources: null },
        { conversation_id: conv.id, role: "assistant", content: c.assistant, sources: c.sources },
      ])
    }
    console.log(`  · seeded ${convos.length} past conversations (with citations)`)
  } catch (e) {
    console.warn(
      `  ⚠ skipped conversations (apply migration 20260623000001_chat_conversations.sql to enable): ${(e as Error).message}`
    )
  }
  // Touch the items map so an unused-var lint never trips if citations change.
  void items
}

// ──────────────────────────────────────────────────────────────────────────
// 10. User preferences: power level, suppress the product tour
// ──────────────────────────────────────────────────────────────────────────
async function seedPreferences(homeId: string, userId: string): Promise<void> {
  await db.from("user_preferences").upsert(
    [
      { user_id: userId, preference_key: "interface_level", preference_value: { level: "advanced" } },
      { user_id: userId, preference_key: "tour_completed", preference_value: true },
    ],
    { onConflict: "user_id,preference_key" }
  )
  // Mark the home profile complete so the user reads as fully onboarded.
  await db.from("home_profile").upsert(
    {
      home_id: homeId,
      home_type: "house",
      ownership: "own",
      ownership_duration: "1_to_5yr",
      preferred_mode: "inventory_first",
      completed_at: new Date(`${SEED_TODAY}T00:00:00Z`).toISOString(),
    },
    { onConflict: "home_id" }
  )
  console.log("  · set power level + tour suppressed + profile complete")
}

// ──────────────────────────────────────────────────────────────────────────
// 11. Read-back diagnostic: sign in AS the test user (anon key, RLS-respecting)
//     and report what they can actually see. Pinpoints membership / RLS / home
//     issues that service-role inserts would otherwise hide.
// ──────────────────────────────────────────────────────────────────────────
async function verifyVisibility(homeId: string): Promise<void> {
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY
  if (!anonKey) {
    console.warn("  ⚠ skipping visibility check (no VITE_SUPABASE_ANON_KEY)")
    return
  }
  const asUser = createClient(URL!, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error: signInErr } = await asUser.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  })
  if (signInErr) {
    console.warn(`  ⚠ DIAG sign-in failed: ${signInErr.message}`)
    return
  }
  const memberships = await asUser.from("home_members").select("home_id, is_primary")
  const items = await asUser.from("item_unit").select("item_unit_id", { count: "exact", head: true }).is("deleted_at", null)
  const providers = await asUser.from("service_provider").select("provider_id", { count: "exact", head: true }).is("deleted_at", null)
  const instances = await asUser.from("task_instance").select("task_instance_id", { count: "exact", head: true })

  console.log("  DIAG (as test user):")
  console.log(`    seeded home_id        = ${homeId}`)
  console.log(`    member of homes       = ${JSON.stringify(memberships.data ?? memberships.error?.message)}`)
  console.log(`    item_unit visible     = ${items.count ?? items.error?.message}`)
  console.log(`    service_provider vis. = ${providers.count ?? providers.error?.message}`)
  console.log(`    task_instance visible = ${instances.count ?? instances.error?.message}`)
  await asUser.auth.signOut()
}

// ──────────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log(`\nSeeding E2E data (frozen today = ${SEED_TODAY})…`)
  const userId = await getOrCreateUser()
  const homeId = await getOrCreateHome(userId)
  await wipe(homeId)
  const rooms = await seedRooms(homeId)
  const items = await seedItems(homeId, rooms)
  await seedTasks(homeId, items)
  await seedProviders(homeId)
  await seedFaqs(homeId, items)
  await seedConversations(homeId, userId, items)
  await seedPreferences(homeId, userId)
  await verifyVisibility(homeId)
  console.log(`\n✓ Done. Sign in as ${TEST_EMAIL}\n  Next: npm run test:e2e\n`)
}

main().catch((e) => {
  console.error("\n✖ Seed failed:", e instanceof Error ? e.message : e)
  process.exit(1)
})
