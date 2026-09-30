/**
 * A home with HISTORY, for the Home read-budget tests (dashboardReads.test.ts).
 *
 * Shaped like a real one rather than a tidy one: completions this month, last
 * month and long ago (past the 90-day window the reads are bounded to), a
 * soft-deleted completion, a done row with no completedAt, a row that was
 * un-done, snoozed/skipped/soft-deleted instances, item-scoped and home-scoped
 * cleaning, cleaning templates that have no instance (non-recurring, and one
 * recurring template that lost its instance), a retired item, a deleted item,
 * warranties inside and outside the window, a recall and items missing details.
 *
 * "Now" is 2026-06-23T19:00Z — noon in Los Angeles, the same calendar day in
 * UTC — so both day conventions in the data layer agree on "today".
 */
import { Timestamp } from "@/test/fakeFirestore"

export const HOME_ID = "h1"
export const FIXTURE_NOW = new Date("2026-06-23T19:00:00Z")

const ts = (iso: string) => Timestamp.fromDate(new Date(iso))
const CREATED = ts("2026-01-05T12:00:00Z")
const GONE = ts("2026-06-01T12:00:00Z")

type Doc = Record<string, unknown>

function item(id: string, over: Doc): [string, Doc] {
  return [
    `homes/${HOME_ID}/items/${id}`,
    {
      displayName: id,
      category: null,
      status: "active",
      roomId: null,
      purchaseDate: null,
      warrantyExpiryDate: null,
      warrantyDurationMonths: null,
      recallStatus: null,
      recallNotes: null,
      notes: null,
      createdAt: CREATED,
      updatedAt: CREATED,
      deletedAt: null,
      ...over,
    },
  ]
}

function template(id: string, over: Doc & { scheduleType?: string }): [string, Doc] {
  const { scheduleType = "monthly", ...rest } = over
  return [
    `homes/${HOME_ID}/taskTemplates/${id}`,
    {
      scopeType: "item_unit",
      itemUnitId: null,
      roomId: null,
      title: id,
      description: `${id} description`,
      careType: "maintenance",
      priorityTier: "recommended",
      riskLevel: "performance",
      estimatedMinutes: 15,
      instructionsOverride: null,
      source: "cho_generated",
      isActive: true,
      schedule: { scheduleType, intervalDays: null, anchorDate: "2026-01-05", season: null, windowDaysBefore: 7, windowDaysAfter: 14 },
      createdAt: CREATED,
      updatedAt: CREATED,
      deletedAt: null,
      ...rest,
    },
  ]
}

const TIER_SCORE: Record<string, number> = { essential: 100, recommended: 50, optional: 10 }

function instance(id: string, over: Doc & { taskTemplateId: string }): [string, Doc] {
  const tier = (over.priorityTier as string | undefined) ?? "recommended"
  return [
    `homes/${HOME_ID}/taskInstances/${id}`,
    {
      itemUnitId: null,
      status: "scheduled",
      dueDate: "2026-07-01",
      windowStart: null,
      windowEnd: null,
      snoozedUntil: null,
      priorityScore: TIER_SCORE[tier],
      isSafetyCritical: false,
      completedAt: null,
      completionNotes: null,
      completionPhotos: [],
      assignedTo: null,
      title: over.taskTemplateId,
      priorityTier: tier,
      careType: "maintenance",
      scopeType: "item_unit",
      estimatedMinutes: 15,
      scheduleType: "monthly",
      itemName: null,
      roomName: null,
      createdAt: CREATED,
      updatedAt: CREATED,
      deletedAt: null,
      ...over,
    },
  ]
}

const done = (id: string, taskTemplateId: string, completedAtIso: string | null, over: Doc = {}) =>
  instance(id, {
    taskTemplateId,
    status: "done",
    completedAt: completedAtIso ? ts(completedAtIso) : null,
    dueDate: (completedAtIso ?? "2026-06-01").slice(0, 10),
    ...over,
  })

/** The whole database, as full document path → data. `withRoutine` adds user-made home routines. */
export function homeWithHistory({ withRoutine = false }: { withRoutine?: boolean } = {}): Record<string, Doc> {
  const rows: Array<[string, Doc]> = [
    [`homes/${HOME_ID}`, { name: "Fixture Home", topConcerns: ["surprise_repairs"], createdAt: CREATED, updatedAt: CREATED }],
    [`homes/${HOME_ID}/rooms/room-kitchen`, { name: "Kitchen", createdAt: CREATED, updatedAt: CREATED, deletedAt: null }],
    [`homes/${HOME_ID}/rooms/room-laundry`, { name: "Laundry", createdAt: CREATED, updatedAt: CREATED, deletedAt: null }],

    // ── items ──
    item("item-furnace", { displayName: "Furnace", category: "furnace", purchaseDate: "2024-10-01", warrantyExpiryDate: "2026-08-01" }),
    item("item-fridge", { displayName: "Refrigerator", category: "refrigerator", roomId: "room-kitchen", recallStatus: "found", recallNotes: "Ice maker recall" }),
    item("item-dryer", { displayName: "Dryer", category: "dryer", roomId: "room-laundry", warrantyDurationMonths: 12 }),
    item("item-water-heater", { displayName: "Water Heater", category: "water_heater", warrantyExpiryDate: "2026-12-01" }),
    item("item-dishwasher", { displayName: "Dishwasher", category: "dishwasher", roomId: "room-kitchen" }),
    item("item-range", { displayName: "Range", category: "range", roomId: "room-kitchen", warrantyExpiryDate: "2026-06-30" }),
    item("item-washer", { displayName: "Washer", category: "washer", roomId: "room-laundry", status: "retired", warrantyExpiryDate: "2026-07-15" }),
    item("item-old-ac", { displayName: "Old AC", category: "air_conditioner", deletedAt: GONE, warrantyExpiryDate: "2026-07-01" }),

    // ── templates ──
    template("tpl-filter", { itemUnitId: "item-furnace", title: "Replace furnace filter", priorityTier: "essential", riskLevel: "prevent_damage" }),
    template("tpl-smoke", { scopeType: "home", title: "Test smoke alarms", priorityTier: "essential", riskLevel: "safety", scheduleType: "semiannual" }),
    template("tpl-coils", { itemUnitId: "item-fridge", title: "Vacuum fridge coils", scheduleType: "semiannual" }),
    template("tpl-dryer-vent", { itemUnitId: "item-dryer", title: "Clean dryer vent", scheduleType: "annual", riskLevel: "safety" }),
    template("tpl-flush", { itemUnitId: "item-water-heater", title: "Flush water heater", priorityTier: "optional", scheduleType: "annual" }),
    template("tpl-descale", { itemUnitId: "item-water-heater", title: "Check anode rod", scheduleType: "quarterly" }),
    template("tpl-hvac-service", { itemUnitId: "item-furnace", title: "Furnace service", priorityTier: "essential", scheduleType: "annual" }),
    template("tpl-gutter", { scopeType: "home", title: "Clean gutters", scheduleType: "seasonal" }),
    template("tpl-nodue", { itemUnitId: "item-washer", title: "Inspect washer hoses", priorityTier: "optional" }),
    template("tpl-undone", { itemUnitId: "item-dryer", title: "Clean lint trap housing", priorityTier: "optional" }),
    template("tpl-mixed", { itemUnitId: "item-washer", title: "Run washer clean cycle", careType: "mixed" }),
    template("tpl-wipe-gasket", { itemUnitId: "item-dishwasher", title: "Wipe door gasket", careType: "cleaning", scheduleType: "weekly", estimatedMinutes: 5, instructionsOverride: "Use a damp cloth." }),
    template("tpl-deep-oven", { itemUnitId: "item-range", title: "Deep-clean the oven", careType: "cleaning", estimatedMinutes: 45 }),
    template("tpl-clean-filter-dw", { itemUnitId: "item-dishwasher", title: "Clean dishwasher filter", careType: "cleaning", estimatedMinutes: 10 }),
    template("tpl-fridge-shelves", { itemUnitId: "item-fridge", title: "Wash fridge shelves", careType: "cleaning", scheduleType: "quarterly", estimatedMinutes: 30 }),
    template("tpl-baseboards", { scopeType: "home", title: "Wipe baseboards", careType: "cleaning", estimatedMinutes: 40 }),
    // Cleaning templates with NO instance: two that never get one, one that lost it.
    template("tpl-asneeded-clean", { itemUnitId: "item-dishwasher", title: "Descale spray arms", careType: "cleaning", scheduleType: "as_needed" }),
    template("tpl-after-use", { itemUnitId: "item-range", title: "Wipe cooktop", careType: "cleaning", scheduleType: "after_each_use" }),
    template("tpl-lost-instance", { itemUnitId: "item-dryer", title: "Wipe dryer drum", careType: "cleaning", scheduleType: "monthly", estimatedMinutes: 10 }),
    template("tpl-inactive-clean", { itemUnitId: "item-range", title: "Polish range knobs", careType: "cleaning", isActive: false }),
    template("tpl-deleted-clean", { itemUnitId: "item-fridge", title: "Clean fridge drip pan", careType: "cleaning", deletedAt: GONE, isActive: false }),

    // ── open instances ──
    instance("i-filter", { taskTemplateId: "tpl-filter", itemUnitId: "item-furnace", itemName: "Furnace", priorityTier: "essential", dueDate: "2026-06-20", title: "Replace furnace filter" }),
    instance("i-smoke", { taskTemplateId: "tpl-smoke", scopeType: "home", priorityTier: "essential", dueDate: "2026-05-01", isSafetyCritical: true, scheduleType: "semiannual", title: "Test smoke alarms" }),
    instance("i-coils", { taskTemplateId: "tpl-coils", itemUnitId: "item-fridge", itemName: "Refrigerator", roomName: "Kitchen", dueDate: "2026-06-23", scheduleType: "semiannual", title: "Vacuum fridge coils" }),
    instance("i-dryer-vent", { taskTemplateId: "tpl-dryer-vent", itemUnitId: "item-dryer", itemName: "Dryer", roomName: "Laundry", dueDate: "2026-06-26", scheduleType: "annual", title: "Clean dryer vent" }),
    instance("i-flush", { taskTemplateId: "tpl-flush", itemUnitId: "item-water-heater", itemName: "Water Heater", priorityTier: "optional", dueDate: "2026-07-02", scheduleType: "annual", title: "Flush water heater" }),
    instance("i-descale", { taskTemplateId: "tpl-descale", itemUnitId: "item-water-heater", itemName: "Water Heater", dueDate: "2026-07-20", scheduleType: "quarterly", title: "Check anode rod" }),
    instance("i-hvac-service", { taskTemplateId: "tpl-hvac-service", itemUnitId: "item-furnace", itemName: "Furnace", priorityTier: "essential", dueDate: "2026-08-20", scheduleType: "annual", title: "Furnace service" }),
    instance("i-gutter-snoozed", { taskTemplateId: "tpl-gutter", scopeType: "home", status: "snoozed", snoozedUntil: "2026-07-07", dueDate: "2026-06-24", scheduleType: "seasonal", title: "Clean gutters" }),
    instance("i-nodue", { taskTemplateId: "tpl-nodue", itemUnitId: "item-washer", itemName: "Washer", priorityTier: "optional", dueDate: null, title: "Inspect washer hoses" }),
    instance("i-undone", { taskTemplateId: "tpl-undone", itemUnitId: "item-dryer", itemName: "Dryer", priorityTier: "optional", dueDate: "2026-06-29", completedAt: ts("2026-06-12T12:00:00Z"), title: "Clean lint trap housing" }),
    instance("i-mixed", { taskTemplateId: "tpl-mixed", itemUnitId: "item-washer", itemName: "Washer", careType: "mixed", dueDate: "2026-06-27", title: "Run washer clean cycle" }),
    instance("i-wipe-gasket", { taskTemplateId: "tpl-wipe-gasket", itemUnitId: "item-dishwasher", itemName: "Dishwasher", roomName: "Kitchen", careType: "cleaning", priorityTier: "optional", dueDate: "2026-06-25", scheduleType: "weekly", estimatedMinutes: 5, title: "Wipe door gasket" }),
    instance("i-deep-oven", { taskTemplateId: "tpl-deep-oven", itemUnitId: "item-range", itemName: "Range", roomName: "Kitchen", careType: "cleaning", priorityTier: "optional", dueDate: "2026-06-10", estimatedMinutes: 45, title: "Deep-clean the oven" }),
    instance("i-clean-filter-dw", { taskTemplateId: "tpl-clean-filter-dw", itemUnitId: "item-dishwasher", itemName: "Dishwasher", roomName: "Kitchen", careType: "cleaning", priorityTier: "optional", dueDate: "2026-07-01", estimatedMinutes: 10, title: "Clean dishwasher filter" }),
    instance("i-fridge-shelves", { taskTemplateId: "tpl-fridge-shelves", itemUnitId: "item-fridge", itemName: "Refrigerator", roomName: "Kitchen", careType: "cleaning", priorityTier: "optional", status: "snoozed", dueDate: "2026-06-30", scheduleType: "quarterly", estimatedMinutes: 30, title: "Wash fridge shelves" }),
    instance("i-baseboards", { taskTemplateId: "tpl-baseboards", scopeType: "home", careType: "cleaning", priorityTier: "optional", dueDate: "2026-06-28", estimatedMinutes: 40, title: "Wipe baseboards" }),
    instance("i-deleted-clean", { taskTemplateId: "tpl-deleted-clean", itemUnitId: "item-fridge", itemName: "Refrigerator", careType: "cleaning", priorityTier: "optional", dueDate: "2026-06-26", estimatedMinutes: null, scheduleType: null, title: "Clean fridge drip pan" }),
    // Not open: soft-deleted while scheduled, and skipped.
    instance("i-gone", { taskTemplateId: "tpl-descale", itemUnitId: "item-water-heater", dueDate: "2026-06-22", deletedAt: GONE, title: "Check anode rod (old)" }),
    instance("i-skipped", { taskTemplateId: "tpl-coils", itemUnitId: "item-fridge", status: "skipped", dueDate: "2026-06-01", title: "Vacuum fridge coils" }),

    // ── completion history ──
    done("d-filter-jun", "tpl-filter", "2026-06-10T12:00:00Z", { priorityTier: "essential", itemUnitId: "item-furnace" }),
    done("d-coils-jun1", "tpl-coils", "2026-06-01T03:00:00Z", { itemUnitId: "item-fridge" }), // first day of the month, UTC
    done("d-coils-may31", "tpl-coils", "2026-05-31T23:30:00Z", { itemUnitId: "item-fridge" }), // May 31 UTC — not this month
    done("d-filter-may", "tpl-filter", "2026-05-12T12:00:00Z", { priorityTier: "essential", itemUnitId: "item-furnace" }),
    done("d-dryer-apr", "tpl-dryer-vent", "2026-04-20T12:00:00Z", { itemUnitId: "item-dryer" }),
    done("d-flush-feb", "tpl-flush", "2026-02-01T12:00:00Z", { priorityTier: "optional", itemUnitId: "item-water-heater" }), // > 90 days
    done("d-smoke-2025", "tpl-smoke", "2025-05-01T12:00:00Z", { priorityTier: "essential", scopeType: "home" }), // > 1 year
    done("d-gasket-jun", "tpl-wipe-gasket", "2026-06-15T12:00:00Z", { careType: "cleaning", itemUnitId: "item-dishwasher" }),
    done("d-oven-jan", "tpl-deep-oven", "2026-01-10T12:00:00Z", { careType: "cleaning", itemUnitId: "item-range" }), // > 90 days
    done("d-dwfilter-deleted", "tpl-clean-filter-dw", "2026-05-30T12:00:00Z", { careType: "cleaning", itemUnitId: "item-dishwasher", deletedAt: GONE }),
    done("d-coils-deleted-jun", "tpl-coils", "2026-06-05T12:00:00Z", { itemUnitId: "item-fridge", deletedAt: GONE }),
    done("d-no-timestamp", "tpl-descale", null, { itemUnitId: "item-water-heater" }),
    done("d-baseboards-mar", "tpl-baseboards", "2026-03-26T12:00:00Z", { careType: "cleaning", scopeType: "home" }), // 89 days — inside the window
    done("d-shelves-mar", "tpl-fridge-shelves", "2026-03-24T12:00:00Z", { careType: "cleaning", itemUnitId: "item-fridge" }), // 91 days — just outside
  ]
  if (withRoutine) {
    rows.push(
      template("tpl-routine-kitchen", { scopeType: "home", itemUnitId: null, source: "user", title: "Kitchen reset", careType: "cleaning", scheduleType: "weekly", estimatedMinutes: 20, createdAt: ts("2026-03-01T12:00:00Z") }),
      template("tpl-routine-bath", { scopeType: "home", itemUnitId: null, source: "user", title: "Bathroom scrub", careType: "cleaning", scheduleType: "weekly", estimatedMinutes: 30, createdAt: ts("2026-04-01T12:00:00Z") }),
    )
  }
  return Object.fromEntries(rows)
}
