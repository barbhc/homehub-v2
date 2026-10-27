/**
 * The scenario registry for /__preview — the design-QA harness.
 *
 * Why this exists (2026-08-27): during round-18 QA, nearly every design note
 * the owner gave was about a hand-drawn MOCKUP of an existing screen — wrong
 * weights, wrong font, spacing, copy that "fit" in the drawing and wrapped on
 * a real phone. The drawing was the proxy, and the proxy lied. This registry
 * renders the REAL component in named states instead, so "does it fit" is
 * answered by the pixels that ship.
 *
 * Each scenario is a name + a render. States that are hard to reach by
 * clicking (lookup found two specs; manual awaiting review) are one URL here.
 * `npm run shots` walks this registry at three device widths and builds a
 * commentable gallery.
 *
 * ADDING ONE: append to SCENARIOS. Keep props honest — real types, no `as`
 * casts of half-objects; if a component needs a provider, it gets it from the
 * app shell this route mounts inside.
 */
import type { ReactNode } from "react"
import { IdentifyStep, type IdentifyData } from "@/components/smart-add/IdentifyStep"
import { PageContainer, InlineError, StaleDataNote, LoadErrorState } from "@/components/layout"
import { RefinedItemDetail } from "@/components/home/RefinedItemDetail"
import { HomeSkeleton } from "@/components/home/HomeSkeleton"
import { StickyHeader } from "@/components/layout/StickyHeader"
import type { ItemUnit, Room } from "@/integrations/types"

const noop = () => {}

const blankIdentify: IdentifyData = {
  brand: "", model: "", name: "", serialNumber: "",
  itemCategory: null, subType: null, categoryFields: {},
  confidence: 0, locationId: null, purchaseDate: null, purchasePrice: null,
}

const rooms: Room[] = [
  { room_id: "r-kitchen", home_id: "h-preview", name: "Kitchen", created_at: "", updated_at: "", deleted_at: null },
]

const dishwasher = (over: Partial<ItemUnit> = {}): ItemUnit => ({
  item_unit_id: "i-preview",
  home_id: "h-preview",
  room_id: "r-kitchen",
  display_name: "Dishwasher",
  category: "dishwasher",
  item_category: "major_appliance",
  sub_type: "dishwasher",
  category_fields: {},
  brand: "Fisher & Paykel",
  model: "DD24DAX9",
  serial_number: null,
  purchase_date: null,
  install_date: null,
  status: "active",
  notes: null,
  photo_storage_ref: null,
  store_name: null,
  price_paid: null,
  receipt_storage_path: null,
  warranty_duration_months: null,
  warranty_coverage: null,
  warranty_expiry_date: null,
  manufactured_year: null,
  recall_status: null,
  recall_checked_at: null,
  recall_notes: null,
  tags: [],
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z",
  deleted_at: null,
  ...over,
})

const itemPage = (item: ItemUnit) => (
  <RefinedItemDetail
    item={item} rooms={rooms} homeId="h-preview"
    tasks={[]} chunks={[]}
    manualState={{ hasManual: false, reading: null, awaitingReview: false }} notificationsBlocked={false}
    onBack={noop} onItemUpdate={noop} onEditDetails={noop}
  />
)

export const SCENARIOS: { id: string; note: string; render: () => ReactNode }[] = [
  {
    id: "identify-appliance-empty",
    note: "Appliance lane, untouched. The screen must not change as you type — no lookup lives here any more.",
    render: () => (
      <PageContainer>
        <IdentifyStep mode="appliance" data={blankIdentify} onDataChange={noop} onModeChange={noop} onConfirm={noop} isCreating={false} error={null} />
      </PageContainer>
    ),
  },
  {
    id: "identify-appliance-filled",
    note: "Brand and model typed. Same screen as empty — that identity is the round-18 contract.",
    render: () => (
      <PageContainer>
        <IdentifyStep mode="appliance"
          data={{ ...blankIdentify, brand: "Fisher & Paykel", model: "DD24DAX9", name: "Fisher & Paykel DD24DAX9" }}
          onDataChange={noop} onModeChange={noop} onConfirm={noop} isCreating={false} error={null} />
      </PageContainer>
    ),
  },
  {
    id: "item-suggestions-two",
    note: "The lookup found two specs. Inline on their own rows, italic + Add — never a card.",
    render: () => itemPage(dishwasher({
      lookup_suggestions: [
        { key: "filter_type", label: "Filter type", value: "Stainless mesh" },
        { key: "installation_date", label: "Installed", value: "2024" },
      ],
    })),
  },
  {
    id: "item-suggestions-dismissed",
    note: "Same item after Hide them. No trace a search happened.",
    render: () => itemPage(dishwasher({
      lookup_suggestions: [{ key: "filter_type", label: "Filter type", value: "Stainless mesh" }],
      lookup_dismissed_at: "2026-08-27T00:00:00Z",
    })),
  },
  {
    id: "item-suggestions-none",
    note: "Lookup missed. Identical to an item that never searched.",
    render: () => itemPage(dishwasher()),
  },
  {
    id: "load-states",
    note: "The shared failure states, each with its retry: InlineError (the most-reused retry in the app), StaleDataNote and LoadErrorState. The hit-target audit taps all three.",
    render: () => (
      <PageContainer>
        <div className="flex flex-col gap-6 py-4">
          <InlineError onRetry={noop}>Couldn&apos;t load the details.</InlineError>
          <InlineError onRetry={noop} className="rounded-xl border px-3.5 py-3">
            Couldn&apos;t search just now — you can still upload or paste a link below.
          </InlineError>
          <StaleDataNote onRetry={noop} />
          <LoadErrorState title="Couldn’t load your items" message="Check your connection and try again." onRetry={noop} />
        </div>
      </PageContainer>
    ),
  },
  {
    id: "home-skeleton",
    note: "Home before its first read lands — shaped like Home, focused: greeting, Ask, one list with the first task open. No stat band.",
    render: () => <HomeSkeleton />,
  },
  {
    id: "home-skeleton-slow",
    note: "The same wait past SKELETON_PATIENCE_MS: it says so instead of shimmering silently.",
    render: () => <HomeSkeleton patienceExpired />,
  },
  {
    id: "sticky-header-scroll-edge",
    note: "StickyHeader: no hairline at the top of the page; it fades in once rows scroll beneath the header (the scroll-edge rule Tasks' lens header adopts).",
    render: () => (
      <div className="min-h-dvh" style={{ background: "var(--hh-bg)" }}>
        <h1 className="px-5 pt-4 pb-2 text-[1.75rem] font-extrabold" style={{ color: "var(--hh-ink)" }}>Tasks</h1>
        <StickyHeader data-testid="scroll-edge-header" className="z-20 px-5 py-3 text-[0.84375rem] font-bold" style={{ background: "var(--hh-bg)", color: "var(--hh-ink)" }}>
          Urgency · Room · Item · Calendar
        </StickyHeader>
        <ul className="mx-4 mt-4 overflow-hidden rounded-2xl" style={{ background: "var(--hh-surface)" }}>
          {Array.from({ length: 30 }, (_, i) => (
            <li key={i} className="border-b px-4 py-3 text-[0.9375rem]" style={{ borderColor: "var(--hh-line)", color: "var(--hh-ink)" }}>
              Row {i + 1}
            </li>
          ))}
        </ul>
      </div>
    ),
  },
]
