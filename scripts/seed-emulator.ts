/**
 * Emulator seed — Admin SDK port of v1's scripts/seed-test-data.ts onto the
 * Firestore model (docs/firestore-model.md).
 *
 * Seeds ONE deterministic test user + isolated home with the SAME curated dataset
 * as v1 (rooms, 6 items with specs/warranty math, 11 tasks — incl. 3 item-scoped
 * cleaning tasks that must stay OUT of the agenda — providers, saved answers, past
 * conversations, preferences), all anchored to SEED_TODAY. Byte-equivalent data to
 * v1 keeps the visual baselines comparable (fix E precondition).
 *
 * Determinism: fixed doc IDs (home, rooms, items, tasks) so re-seeding overwrites
 * rather than duplicating. taskInstances carry the denormalized display fields
 * (firestore-model.md §5) — the seed is itself a check that the denorm set is
 * sufficient for every read model.
 *
 * Dates: calendar dates ("YYYY-MM-DD") stay strings; instants are Timestamps
 * (firestore-model.md §0).
 *
 * Run with emulators up (`npm run emu`):
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
 *     npm run seed:emu
 */
import { initializeApp } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore, Timestamp } from "firebase-admin/firestore"
import { SEED_TODAY, TEST_HOME_NAME, TEST_EMAIL, TEST_PASSWORD, dayOffset } from "../e2e/seed-config"

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error(
    "Refusing to run: FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST not set.\n" +
    "This script seeds EMULATORS ONLY — it must never touch a real project."
  )
  process.exit(1)
}

const app = initializeApp({ projectId: "demo-homehub" })
const auth = getAuth(app)
const db = getFirestore(app)

const HOME_ID = "e2e-home"
/** Instant at SEED_TODAY midnight UTC — reused for created/checked timestamps. */
const NOW = Timestamp.fromDate(new Date(`${SEED_TODAY}T00:00:00Z`))
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")

// ── 1. Test auth user (idempotent) ──────────────────────────────────────────
async function getOrCreateUser(): Promise<string> {
  try {
    const existing = await auth.getUserByEmail(TEST_EMAIL)
    await auth.updateUser(existing.uid, { password: TEST_PASSWORD, emailVerified: true })
    return existing.uid
  } catch {
    const created = await auth.createUser({ email: TEST_EMAIL, password: TEST_PASSWORD, emailVerified: true })
    return created.uid
  }
}

// ── 2. Home + membership + folded home profile + user prefs ──────────────────
async function seedHome(uid: string): Promise<void> {
  await db.doc(`homes/${HOME_ID}`).set({
    name: TEST_HOME_NAME,
    timezone: "America/Los_Angeles",
    // home_profile folded onto the home doc (firestore-model.md §2).
    homeType: "house",
    ownership: "own",
    ownershipDuration: "1_to_5yr",
    preferredMode: "inventory_first",
    profileCompletedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
  })
  await db.doc(`homes/${HOME_ID}/members/${uid}`).set({
    uid, // enables the collectionGroup("members").where("uid","==",…) lookup in homeService
    role: "owner",
    isPrimary: true,
    joinedAt: NOW,
  })
  // Public profile + private prefs (self-only subtree).
  await db.doc(`users/${uid}`).set({ fullName: "E2E Tester", avatarUrl: null, createdAt: NOW, updatedAt: NOW })
  await db.doc(`users/${uid}/private/preferences`).set({ interfaceLevel: "advanced", tourCompleted: true, updatedAt: NOW })
}

// ── 3. Rooms ─────────────────────────────────────────────────────────────────
async function seedRooms(): Promise<Record<string, string>> {
  const names = ["Kitchen", "Laundry Room", "Living Room", "Garage", "Bathroom"]
  const byName: Record<string, string> = {}
  for (const name of names) {
    const roomId = slug(name)
    byName[name] = roomId
    await db.doc(`homes/${HOME_ID}/rooms/${roomId}`).set({ name, createdAt: NOW, updatedAt: NOW, deletedAt: null })
  }
  return byName
}

// ── 4. Items (specs via categoryFields; warranty via purchaseDate + months) ───
type ItemSeed = {
  key: string; displayName: string; category: string; itemCategory: string
  brand: string; model: string; room: string; purchaseOffset: number
  warrantyMonths: number; categoryFields: Record<string, string>
}
async function seedItems(rooms: Record<string, string>): Promise<Record<string, { id: string; name: string; room: string }>> {
  const items: ItemSeed[] = [
    { key: "dishwasher", displayName: "Bosch 800 Series Dishwasher", category: "dishwasher", itemCategory: "major_appliance", brand: "Bosch", model: "SHPM88Z75N", room: "Kitchen", purchaseOffset: -400, warrantyMonths: 24, categoryFields: { Capacity: "16 place settings", "Noise level": "42 dBA", "Energy use": "269 kWh/yr" } },
    { key: "fridge", displayName: "LG French Door Refrigerator", category: "refrigerator", itemCategory: "major_appliance", brand: "LG", model: "LRFVS3006S", room: "Kitchen", purchaseOffset: -800, warrantyMonths: 12, categoryFields: { Capacity: "30 cu ft", Type: "French door", "Ice maker": "Dual" } },
    { key: "furnace", displayName: "Carrier Infinity Furnace", category: "furnace", itemCategory: "system", brand: "Carrier", model: "59MN7", room: "Garage", purchaseOffset: -1200, warrantyMonths: 120, categoryFields: { Stages: "Modulating", AFUE: "98.5%", Fuel: "Natural gas" } },
    { key: "washer", displayName: "Whirlpool Front-Load Washer", category: "washer", itemCategory: "major_appliance", brand: "Whirlpool", model: "WFW9620HC", room: "Laundry Room", purchaseOffset: -200, warrantyMonths: 12, categoryFields: { Capacity: "5.0 cu ft", "Spin speed": "1300 RPM" } },
    { key: "waterheater", displayName: "Rheem Performance Water Heater", category: "water_heater", itemCategory: "system", brand: "Rheem", model: "XE50T10", room: "Garage", purchaseOffset: -1500, warrantyMonths: 72, categoryFields: { Capacity: "50 gal", "First-hour rating": "62 gal" } },
    { key: "range", displayName: "GE Profile Gas Range", category: "range", itemCategory: "major_appliance", brand: "GE", model: "PGB960", room: "Kitchen", purchaseOffset: -90, warrantyMonths: 12, categoryFields: { Burners: "5", "Oven capacity": "5.6 cu ft", Convection: "Yes" } },
  ]
  const out: Record<string, { id: string; name: string; room: string }> = {}
  for (const it of items) {
    const id = it.key
    out[it.key] = { id, name: it.displayName, room: it.room }
    await db.doc(`homes/${HOME_ID}/items/${id}`).set({
      roomId: rooms[it.room],
      displayName: it.displayName,
      category: it.category,
      itemCategory: it.itemCategory,
      brand: it.brand,
      model: it.model,
      status: "active",
      purchaseDate: dayOffset(it.purchaseOffset),
      warrantyDurationMonths: it.warrantyMonths,
      categoryFields: it.categoryFields,
      tags: [],
      recallStatus: "none_found",
      recallCheckedAt: NOW,
      photoPath: null,
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
    })
  }
  return out
}

// ── 5. Tasks: template (inlined schedule + denorm) + instance (denorm §5) ─────
type TaskSeed = {
  title: string; scope: "home" | "item_unit"; itemKey?: string
  care: "cleaning" | "maintenance" | "mixed"; tier: "essential" | "recommended" | "optional"
  risk: "safety" | "prevent_damage" | "performance" | "comfort"; minutes: number
  schedule: "weekly" | "monthly" | "quarterly" | "semiannual" | "annual" | "seasonal" | "every_n_days"
  season?: "spring" | "summer" | "fall" | "winter"; intervalDays?: number
  dueOffset: number; status?: "scheduled" | "done"; safety?: boolean; justification?: string
}
async function seedTasks(items: Record<string, { id: string; name: string; room: string }>): Promise<void> {
  const tasks: TaskSeed[] = [
    { title: "Replace HVAC furnace filter", scope: "item_unit", itemKey: "furnace", care: "maintenance", tier: "essential", risk: "prevent_damage", minutes: 10, schedule: "monthly", dueOffset: -5, justification: "A clogged filter strains the blower and cuts efficiency." },
    { title: "Test smoke & CO detectors", scope: "home", care: "maintenance", tier: "essential", risk: "safety", minutes: 10, schedule: "semiannual", dueOffset: -2, safety: true, justification: "Working detectors are your first warning in a fire or CO leak." },
    { title: "Flush the water heater", scope: "item_unit", itemKey: "waterheater", care: "maintenance", tier: "recommended", risk: "prevent_damage", minutes: 45, schedule: "annual", dueOffset: 4, justification: "Sediment buildup shortens tank life and raises energy use." },
    { title: "Service AC before summer", scope: "item_unit", itemKey: "furnace", care: "maintenance", tier: "recommended", risk: "performance", minutes: 60, schedule: "seasonal", season: "summer", dueOffset: 6, justification: "A pre-season check keeps cooling reliable through the heat." },
    { title: "Vacuum refrigerator coils", scope: "item_unit", itemKey: "fridge", care: "maintenance", tier: "recommended", risk: "performance", minutes: 20, schedule: "semiannual", dueOffset: 12, justification: "Dusty coils make the compressor work harder." },
    { title: "Clean range-hood filter", scope: "home", care: "cleaning", tier: "optional", risk: "performance", minutes: 15, schedule: "monthly", dueOffset: 2 },
    { title: "Wipe down kitchen surfaces", scope: "home", care: "cleaning", tier: "optional", risk: "comfort", minutes: 10, schedule: "weekly", dueOffset: 1 },
    { title: "Run washer cleaning cycle", scope: "item_unit", itemKey: "washer", care: "cleaning", tier: "recommended", risk: "performance", minutes: 15, schedule: "monthly", dueOffset: -10, status: "done" },
    // Item-scoped CLEANING — must be FILTERED OUT of the Tasks agenda (guards the flatten regression).
    { title: "Clean oven door glass", scope: "item_unit", itemKey: "range", care: "cleaning", tier: "optional", risk: "comfort", minutes: 15, schedule: "quarterly", dueOffset: 3 },
    { title: "Descale the dishwasher", scope: "item_unit", itemKey: "dishwasher", care: "cleaning", tier: "recommended", risk: "performance", minutes: 30, schedule: "monthly", dueOffset: 8 },
    { title: "Wipe refrigerator shelves", scope: "item_unit", itemKey: "fridge", care: "cleaning", tier: "optional", risk: "comfort", minutes: 20, schedule: "monthly", dueOffset: 9 },
  ]

  let i = 0
  for (const t of tasks) {
    const tplId = `tpl-${String(i).padStart(2, "0")}-${slug(t.title)}`
    const instId = `inst-${String(i).padStart(2, "0")}-${slug(t.title)}`
    i++
    const item = t.itemKey ? items[t.itemKey] : null
    const itemName = item?.name ?? null
    const roomName = item?.room ?? null
    const priorityScore = t.tier === "essential" ? 100 : t.tier === "recommended" ? 50 : 10

    await db.doc(`homes/${HOME_ID}/taskTemplates/${tplId}`).set({
      scopeType: t.scope,
      itemUnitId: item?.id ?? null,
      roomId: null,
      title: t.title,
      description: null,
      careType: t.care,
      careTypeOverriddenAt: null,
      justification: t.justification ?? null,
      symptomTags: [],
      reCheckTriggers: [],
      priorityTier: t.tier,
      riskLevel: t.risk,
      estimatedMinutes: t.minutes,
      defaultAssignee: null,
      instructionsChunkId: null,
      instructionsOverride: null,
      steps: null,
      sourcePage: null,
      suppliesMode: "none",
      supplies: [],
      source: "cho_generated",
      isUserEditable: true,
      userModifiedAt: null,
      isActive: true,
      metadata: {},
      manualId: null,
      externalKey: null,
      // schedule_rule inlined (firestore-model.md §1).
      schedule: {
        scheduleType: t.schedule,
        intervalDays: t.intervalDays ?? null,
        anchorDate: SEED_TODAY,
        season: t.season ?? null,
        windowDaysBefore: 7,
        windowDaysAfter: 14,
      },
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
    })

    await db.doc(`homes/${HOME_ID}/taskInstances/${instId}`).set({
      taskTemplateId: tplId,
      itemUnitId: item?.id ?? null,
      status: t.status ?? "scheduled",
      dueDate: dayOffset(t.dueOffset),
      windowStart: null,
      windowEnd: null,
      snoozedUntil: null,
      priorityScore,
      isSafetyCritical: t.safety ?? false,
      completedAt: t.status === "done" ? Timestamp.fromDate(new Date(`${dayOffset(t.dueOffset)}T17:00:00Z`)) : null,
      completionNotes: null,
      completionPhotos: [],
      assignedTo: null,
      // Denormalized display fields (firestore-model.md §5).
      title: t.title,
      priorityTier: t.tier,
      careType: t.care,
      scopeType: t.scope,
      estimatedMinutes: t.minutes,
      scheduleType: t.schedule,
      itemName,
      roomName,
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
    })
  }
}

// ── 6. Service providers ──────────────────────────────────────────────────────
async function seedProviders(): Promise<void> {
  const providers = [
    { name: "Ace Heating & Air", category: "hvac", phone: "(415) 555-0142", email: "service@aceheatingair.com", website: "https://aceheatingair.com", notes: "Installed the Carrier furnace. Ask for Marco for the annual tune-up." },
    { name: "Pro Plumb", category: "plumbing", phone: "(415) 555-0188", email: "dispatch@proplumb.com", website: "https://proplumb.com", notes: "Same-day for leaks. Flat $95 diagnostic." },
    { name: "Bright Spark Electric", category: "electrical", phone: "(415) 555-0119", email: "hello@brightspark.com", website: "https://brightspark.com", notes: "Licensed + insured. Did the panel upgrade in 2024." },
    { name: "Sears Appliance Repair", category: "appliance", phone: "(800) 555-4663", email: null, website: "https://searshomeservices.com", notes: "Covers the LG fridge and Whirlpool washer." },
  ]
  for (const p of providers) {
    await db.doc(`homes/${HOME_ID}/serviceProviders/${slug(p.name)}`).set({ ...p, createdAt: NOW, updatedAt: NOW, deletedAt: null })
  }
}

// ── 7. Saved Ask answers (chatFaqs) ───────────────────────────────────────────
async function seedFaqs(items: Record<string, { id: string }>): Promise<void> {
  const faqs = [
    { key: "dishwasher", question: "How do I descale my Bosch dishwasher?", answer: "Run a hot cycle with a dishwasher descaler (or 2 cups of white vinegar in a bowl on the top rack) once a month in hard-water areas. Bosch recommends a dedicated descaling product to protect the seals." },
    { key: "furnace", question: "What furnace filter size do I need?", answer: "The Carrier Infinity takes a 20x25x5 media filter. Replace it every 3 months, or monthly if you have pets." },
  ]
  let i = 0
  for (const f of faqs) {
    await db.doc(`homes/${HOME_ID}/chatFaqs/faq-${i++}`).set({
      itemUnitId: items[f.key].id, question: f.question, answer: f.answer, createdAt: NOW,
    })
  }
}

// ── 8. Past conversations with cited answers ──────────────────────────────────
async function seedConversations(uid: string): Promise<void> {
  const convos = [
    { title: "Descale Bosch dishwasher", user: "How do I descale my Bosch dishwasher?", assistant: "Run a monthly descaling cycle: place a Bosch-approved descaler (or a bowl of white vinegar) on the top rack and run the hottest cycle empty. This clears limescale from the spray arms and heater.", sources: [{ sourceType: "manual", itemName: "Bosch 800 Series Dishwasher", title: "Care & cleaning · p.38" }] },
    { title: "HVAC filter size", user: "What size filter does my furnace take?", assistant: "Your Carrier Infinity uses a 20x25x5 media filter. Swap it every 3 months. I added a recurring 'Replace HVAC furnace filter' task so you don't have to track it.", sources: [{ sourceType: "manual", itemName: "Carrier Infinity Furnace", title: "Maintenance · p.12" }] },
    { title: "Fridge water tastes off", user: "The water from my LG fridge tastes off — what should I check?", assistant: "That's almost always the water filter. The LG LRFVS3006S uses an LT1000P filter; replace it every 6 months. Run 2.5 gallons through after installing to clear carbon fines.", sources: [{ sourceType: "manual", itemName: "LG French Door Refrigerator", title: "Water filter · p.21" }] },
  ]
  let i = 0
  for (const c of convos) {
    const cid = `conv-${i++}`
    await db.doc(`homes/${HOME_ID}/chatConversations/${cid}`).set({ userId: uid, title: c.title, createdAt: NOW, updatedAt: NOW })
    await db.doc(`homes/${HOME_ID}/chatConversations/${cid}/messages/m0`).set({ role: "user", content: c.user, sources: null, createdAt: NOW })
    await db.doc(`homes/${HOME_ID}/chatConversations/${cid}/messages/m1`).set({ role: "assistant", content: c.assistant, sources: c.sources, createdAt: NOW })
  }
}

// ── Read-back diagnostic ──────────────────────────────────────────────────────
async function verify(): Promise<void> {
  const [items, instances, providers] = await Promise.all([
    db.collection(`homes/${HOME_ID}/items`).count().get(),
    db.collection(`homes/${HOME_ID}/taskInstances`).count().get(),
    db.collection(`homes/${HOME_ID}/serviceProviders`).count().get(),
  ])
  console.log("  DIAG:")
  console.log(`    items            = ${items.data().count}`)
  console.log(`    taskInstances    = ${instances.data().count}`)
  console.log(`    serviceProviders = ${providers.data().count}`)
}

async function main(): Promise<void> {
  console.log(`\nSeeding emulator (frozen today = ${SEED_TODAY})…`)
  const uid = await getOrCreateUser()
  console.log(`✓ auth user ${TEST_EMAIL} (${uid})`)
  await seedHome(uid)
  const rooms = await seedRooms()
  const items = await seedItems(rooms)
  await seedTasks(items)
  await seedProviders()
  await seedFaqs(items)
  await seedConversations(uid)
  await verify()
  console.log(`\n✓ Done. Sign in as ${TEST_EMAIL}\n`)
}

main().then(() => process.exit(0)).catch((e) => { console.error("\n✖ Seed failed:", e); process.exit(1) })
