import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  ChevronLeftIcon, ChevronDownIcon, ChevronUpIcon,
  ShieldCheckIcon, MegaphoneIcon, PencilIcon, SparklesIcon, SearchIcon,
  WrenchIcon, TagIcon, BookOpenIcon,
  WindIcon, RefrigeratorIcon, FlameIcon, WashingMachineIcon, UtensilsIcon, PackageIcon,
  type LucideIcon,
} from "lucide-react"
import type {
  ItemUnit, Room, KnowledgeChunk, ManualDocument, ChatFaq,
} from "@/integrations/types"
import type { TaskTemplateWithSchedule } from "@/modules/care"
import { HistorySection, ManualSection } from "@/pages/item-detail"
import { parseSteps } from "@/pages/item-detail/utils"
import { CareBlock } from "@/components/item-care/CareBlock"
import { categoryLabel } from "@/lib/categoryLabel"
import { WarrantyPanel } from "@/components/item-care/WarrantyPanel"
import { StepList, InfoBlurb, ManualBlurb, ProEscalate } from "@/components/tasks/TaskHowTo"
import { ItemPhoto } from "./ItemPhoto"

const INK = "var(--hh-ink)", SUB = "var(--hh-sub)", TEAL = "var(--hh-teal)", CLAY = "var(--hh-clay)", FAINT = "var(--hh-faint)"
const SLATE = "var(--hh-slate)", SLATE_SOFT = "var(--hh-slate-soft)", TEAL_WASH = "var(--hh-teal-wash)", LINE = "var(--hh-line)"

const KW: [RegExp, LucideIcon][] = [
  [/fridge|refriger/i, RefrigeratorIcon],
  [/hvac|furnace|a\/c|air|heat pump/i, WindIcon],
  [/water heater|boiler|flame|gas/i, FlameIcon],
  [/wash|dryer|laundry/i, WashingMachineIcon],
  [/dishwash|oven|range|cook|stove/i, UtensilsIcon],
]
function glyphFor(item: ItemUnit): LucideIcon {
  const hay = `${item.display_name} ${item.category ?? ""}`
  for (const [re, icon] of KW) if (re.test(hay)) return icon
  return PackageIcon
}
function fmtDate(s: string | null): string | null {
  if (!s) return null
  return new Date(s.length === 10 ? s + "T12:00:00" : s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

// ── Small presentational helpers ─────────────────────────────────────────────
function Card({ children, pad = 18, className = "" }: { children: React.ReactNode; pad?: number; className?: string }) {
  return (
    <div className={`rounded-[18px] bg-[var(--hh-surface)] shadow-[0_1px_2px_rgba(15,23,42,0.05)] ${className}`} style={{ padding: pad }}>
      {children}
    </div>
  )
}
function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-2.5 flex items-baseline justify-between">
      <span className="text-[11px] font-bold uppercase tracking-[0.5px]" style={{ color: SUB }}>{children}</span>
      {right}
    </div>
  )
}
function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.4px]" style={{ color: FAINT }}>{label}</div>
      <div className="mt-1 text-[14px] font-semibold" style={{ color: INK, fontFamily: mono ? "ui-monospace, monospace" : undefined }}>{value}</div>
    </div>
  )
}
// Normalize an item's structured `category_fields` JSON into concise spec rows.
// Accepts either an object map {label: value} or an array [{k,v}]. Only short,
// scalar values are kept — long manual prose is intentionally excluded (it
// belongs in the manual viewer, not the Specs list).
function prettyLabel(k: string): string {
  return k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}
function toSpecRows(cf: unknown): { label: string; value: string }[] {
  if (!cf || typeof cf !== "object") return []
  const out: { label: string; value: string }[] = []
  const push = (k: unknown, v: unknown) => {
    if (k == null || v == null || typeof v === "object") return
    const label = prettyLabel(String(k).trim())
    const value = String(v).trim()
    if (!label || !value || value.length > 60) return // concise only
    out.push({ label, value })
  }
  if (Array.isArray(cf)) {
    for (const e of cf) {
      if (e && typeof e === "object") push((e as Record<string, unknown>).k, (e as Record<string, unknown>).v)
    }
  } else {
    for (const [k, v] of Object.entries(cf as Record<string, unknown>)) push(k, v)
  }
  return out
}

// ── Guides tab (how_to + cleaning_guide chunks) ──────────────────────────────
/** Title + "N steps · manual p.X" meta; expands to the shared numbered steps. */
function GuideCard({ chunk, onOpenManualPage }: { chunk: KnowledgeChunk; onOpenManualPage?: (page: number) => void }) {
  const [open, setOpen] = useState(false)
  const scenarios = chunk.scenarios ?? []
  const stepCount = scenarios.reduce((n, s) => n + (s.steps?.length ?? 0), 0)
  const page = chunk.source_pages?.[0] ?? null
  const meta = [stepCount > 0 ? `${stepCount} step${stepCount === 1 ? "" : "s"}` : null, page != null ? `manual p.${page}` : null].filter(Boolean).join(" · ")
  // No structured scenarios → parse the prose into steps so guides never dump a paragraph.
  const fallbackSteps = scenarios.length === 0 ? parseSteps(chunk.content ?? "") : []
  return (
    <Card pad={0}>
      <div onClick={() => setOpen((v) => !v)} className="flex cursor-pointer items-center gap-3 px-4 py-3.5">
        <div className="grid size-9 shrink-0 place-items-center rounded-[10px]" style={{ background: TEAL_WASH }}>
          <BookOpenIcon className="size-[18px]" style={{ color: TEAL }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[14.5px] font-bold tracking-[-0.2px]" style={{ color: INK }}>{chunk.title || "Guide"}</div>
          {meta && <div className="mt-0.5 text-[12.5px]" style={{ color: SUB }}>{meta}</div>}
        </div>
        {open ? <ChevronUpIcon className="size-[18px]" style={{ color: FAINT }} /> : <ChevronDownIcon className="size-[18px]" style={{ color: FAINT }} />}
      </div>
      {open && (
        <div className="flex flex-col gap-3.5 px-4 pb-4 pt-3.5" style={{ borderTop: `1px solid ${LINE}`, background: SLATE_SOFT }}>
          {scenarios.length > 0 ? (
            scenarios.map((sc, si) => (
              <div key={si} className="flex flex-col gap-2">
                {sc.condition && <div className="text-[11px] font-bold uppercase tracking-[0.4px]" style={{ color: SUB }}>{sc.condition}</div>}
                <StepList steps={sc.steps ?? []} />
              </div>
            ))
          ) : fallbackSteps.length > 0 ? (
            <StepList steps={fallbackSteps} />
          ) : (
            <div className="text-[13px]" style={{ color: SUB }}>Open this guide for the full steps.</div>
          )}
          {page != null && onOpenManualPage && <ManualBlurb page={page} onOpen={() => onOpenManualPage(page)} />}
        </div>
      )}
    </Card>
  )
}

function GuidesTab({ howTo, cleaning, onAsk, itemName, onOpenManualPage }: {
  howTo: KnowledgeChunk[]
  cleaning: KnowledgeChunk[]
  onAsk: () => void
  itemName: string
  onOpenManualPage?: (page: number) => void
}) {
  const [q, setQ] = useState("")
  const total = howTo.length + cleaning.length
  const match = (c: KnowledgeChunk) => (c.title ?? "").toLowerCase().includes(q.trim().toLowerCase())
  const ht = howTo.filter(match)
  const cl = cleaning.filter(match)
  const hasAny = total > 0
  const hasResults = ht.length > 0 || cl.length > 0
  return (
    <div className="flex flex-col gap-6">
      {/* Search over the guides */}
      {total > 1 && (
        <div className="flex items-center gap-2.5 rounded-xl px-3 py-2.5" style={{ background: "var(--hh-surface)", border: `1px solid ${LINE}` }}>
          <SearchIcon className="size-4 shrink-0" style={{ color: FAINT }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${total} guides…`}
            className="w-full bg-transparent text-[13.5px] outline-none placeholder:text-[var(--hh-faint)]"
            style={{ color: INK }}
          />
        </div>
      )}
      {ht.length > 0 && (
        <div>
          <SectionLabel>How-to guides</SectionLabel>
          <div className="flex flex-col gap-3">
            {ht.map((c) => <GuideCard key={c.chunk_id} chunk={c} onOpenManualPage={onOpenManualPage} />)}
          </div>
        </div>
      )}
      {cl.length > 0 && (
        <div>
          <SectionLabel>Cleaning guides</SectionLabel>
          <div className="flex flex-col gap-3">
            {cl.map((c) => <GuideCard key={c.chunk_id} chunk={c} onOpenManualPage={onOpenManualPage} />)}
          </div>
        </div>
      )}
      {!hasAny && (
        <Card className="text-center" pad={26}>
          <div className="text-[13.5px]" style={{ color: SUB }}>Add the manual to unlock step-by-step how-to guides.</div>
        </Card>
      )}
      {hasAny && !hasResults && (
        <Card className="text-center" pad={26}>
          <div className="text-[13.5px]" style={{ color: SUB }}>No guides match “{q}”.</div>
        </Card>
      )}
      <button onClick={onAsk} className="inline-flex items-center gap-1.5 self-start text-[13px] font-bold" style={{ color: TEAL }}>
        <SparklesIcon className="size-[15px]" /> Ask Homehub about {itemName}
      </button>
    </div>
  )
}

// ── Fix-it tab (troubleshooting chunks) ──────────────────────────────────────
// A fix that mentions a trade pro / live electrical / gas should escalate, not
// hand the homeowner DIY steps for it.
const PRO_RE = /electrician|technician|licensed|qualified pro|professional|certified|gas fitter|plumber|service call|service technician/i

/** Symptom → Likely cause (slate) → The fix (steps) → manual + escalate. */
function TroubleshootCard({ chunk, onOpenManualPage, onFindPro }: {
  chunk: KnowledgeChunk
  onOpenManualPage?: (page: number) => void
  onFindPro: () => void
}) {
  const [open, setOpen] = useState(false)
  const scenarios = (chunk.scenarios?.length
    ? chunk.scenarios.map((s) => ({ cause: s.condition, steps: s.steps ?? [] }))
    : [{ cause: undefined as string | undefined, steps: parseSteps(chunk.content ?? "") }]
  ).filter((s) => s.steps.length > 0 || s.cause)
  const page = chunk.source_pages?.[0] ?? null
  const needsPro = PRO_RE.test(chunk.content ?? "") || scenarios.some((s) => s.steps.some((st: string) => PRO_RE.test(st)))

  return (
    <Card pad={0}>
      <div onClick={() => setOpen((v) => !v)} className="flex cursor-pointer items-center gap-3 px-4 py-3.5">
        <div className="grid size-8 shrink-0 place-items-center rounded-[8px]" style={{ background: "var(--hh-clay-soft)" }}>
          <WrenchIcon className="size-4" style={{ color: CLAY }} />
        </div>
        {/* Symptom is the row title — not repeated inside. */}
        <div className="flex-1 text-[14.5px] font-semibold" style={{ color: INK }}>{chunk.title || "Troubleshooting"}</div>
        {open ? <ChevronUpIcon className="size-[18px]" style={{ color: FAINT }} /> : <ChevronDownIcon className="size-[18px]" style={{ color: FAINT }} />}
      </div>
      {open && (
        <div className="flex flex-col gap-3.5 px-4 pb-4 pt-3.5" style={{ borderTop: `1px solid ${LINE}`, background: SLATE_SOFT }}>
          {scenarios.map((s, i) => (
            <div key={i} className="flex flex-col gap-3">
              {s.cause && <InfoBlurb label="Likely cause" icon="search" text={s.cause} />}
              {s.steps.length > 0 && <StepList steps={s.steps} label="The fix" />}
            </div>
          ))}
          {page != null && onOpenManualPage && <ManualBlurb page={page} onOpen={() => onOpenManualPage(page)} />}
          {needsPro && (
            <ProEscalate
              text="If this doesn't resolve it, have it checked by a qualified professional rather than pushing further."
              cta="Find a pro"
              onFindPro={onFindPro}
            />
          )}
        </div>
      )}
    </Card>
  )
}

function FixTab({ trouble, onAsk, onOpenManualPage, onFindPro }: {
  trouble: KnowledgeChunk[]
  onAsk: () => void
  onOpenManualPage?: (page: number) => void
  onFindPro: () => void
}) {
  return (
    <div className="flex flex-col gap-3">
      {trouble.length ? (
        trouble.map((c) => <TroubleshootCard key={c.chunk_id} chunk={c} onOpenManualPage={onOpenManualPage} onFindPro={onFindPro} />)
      ) : (
        <Card className="text-center" pad={26}>
          <div className="text-[13.5px]" style={{ color: SUB }}>No troubleshooting yet for this item.</div>
        </Card>
      )}
      <button onClick={onAsk} className="inline-flex items-center gap-1.5 self-start text-[13px] font-bold" style={{ color: TEAL }}>
        <SparklesIcon className="size-[15px]" /> Still stuck? Ask Homehub
      </button>
    </div>
  )
}

// ── Saved answers tab (faqs) ─────────────────────────────────────────────────
function SavedTab({ faqs }: { faqs: ChatFaq[] }) {
  if (faqs.length === 0) {
    return (
      <Card className="text-center" pad={26}>
        <div className="text-[13.5px]" style={{ color: SUB }}>Answers you save from Ask will collect here.</div>
      </Card>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      {faqs.map((f) => (
        <Card key={f.faq_id}>
          <div className="mb-1.5 text-[14.5px] font-bold" style={{ color: INK }}>{f.question}</div>
          <div className="whitespace-pre-wrap text-[13.5px] leading-relaxed" style={{ color: SUB }}>{f.answer}</div>
          <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11.5px] font-semibold" style={{ background: TEAL_WASH, color: TEAL }}>
            <SparklesIcon className="size-3" /> Saved from Ask
          </div>
        </Card>
      ))}
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────
export interface DesktopItemDetailProps {
  item: ItemUnit
  rooms: Room[]
  homeId: string
  /** Full task list for this item; CareBlock routes by schedule_type. */
  tasks: TaskTemplateWithSchedule[]
  chunks: KnowledgeChunk[]
  manuals: ManualDocument[]
  faqs: ChatFaq[]
  historyKey: number
  onBack: () => void
  onEdit: () => void
  /** Opens the manual viewer at a page (from a task's "Open manual · p.X" link). */
  onOpenManualPage?: (page: number) => void
  /** Setup-reveal writes setup_revealed_at; bubble the updated item up. */
  onItemUpdate?: (item: ItemUnit) => void
  /** Props forwarded to the reused ManualSection manager. */
  manualSectionProps: React.ComponentProps<typeof ManualSection>
}

type TabId = "tasks" | "guides" | "fix" | "saved" | "activity"

export function DesktopItemDetail({
  item, rooms, homeId, tasks, chunks, manuals, faqs, historyKey, onBack, onEdit, onOpenManualPage, onItemUpdate, manualSectionProps,
}: DesktopItemDetailProps) {
  const navigate = useNavigate()
  const Glyph = glyphFor(item)
  const roomName = useMemo(() => rooms.find((r) => r.room_id === item.room_id)?.name ?? null, [rooms, item.room_id])

  const howToChunks = chunks.filter((c) => c.chunk_type === "how_to")
  const cleaningChunks = chunks.filter((c) => c.chunk_type === "cleaning_guide")
  const troubleChunks = chunks.filter((c) => c.chunk_type === "troubleshooting")
  // Specs render as concise key→value pairs from the item's structured
  // `category_fields`, NOT the long manual-prose `specs` knowledge chunks
  // (those belong in the manual viewer / Guides, and over-render here).
  const specRows = toSpecRows(item.category_fields)
  const guideCount = howToChunks.length + cleaningChunks.length
  const hasManual = manuals.some((m) => m.parsed_at !== null)

  const recallFound = item.recall_status === "found"

  // Tabs only appear when they carry real data (Tasks + Activity always render).
  const tabs: { id: TabId; label: string; n: number; show: boolean }[] = [
    { id: "tasks", label: "Tasks", n: tasks.length, show: true },
    { id: "guides", label: "Guides", n: guideCount, show: guideCount > 0 },
    { id: "fix", label: "Fix it", n: troubleChunks.length, show: troubleChunks.length > 0 },
    { id: "saved", label: "Saved answers", n: faqs.length, show: true },
    { id: "activity", label: "Activity", n: 0, show: true },
  ]
  const visibleTabs = tabs.filter((t) => t.show)
  const [tab, setTab] = useState<TabId>("tasks")

  const goAsk = () => navigate(`/chat?item=${item.item_unit_id}`)

  // Warranty header: prefer the expiry date; fall back to the coverage length
  // (months → "1 year") so a tracked-but-undated warranty doesn't read "None".
  const warrantyField = item.warranty_expiry_date
    ? fmtDate(item.warranty_expiry_date)
    : item.warranty_duration_months != null
      ? item.warranty_duration_months >= 12 && item.warranty_duration_months % 12 === 0
        ? `${item.warranty_duration_months / 12} year${item.warranty_duration_months === 12 ? "" : "s"}`
        : `${item.warranty_duration_months} months`
      : "None"
  const headerFields: [string, string | null, boolean?][] = [
    ["Room", roomName],
    ["Serial", item.serial_number, true],
    ["Purchased", fmtDate(item.purchase_date)],
    ["Warranty", warrantyField],
    ["Category", categoryLabel(item)],
  ]
  const shownHeaderFields = headerFields.filter(([, v]) => !!v) as [string, string, boolean?][]

  return (
    <div>
      <button onClick={onBack} className="mb-3.5 inline-flex items-center gap-1 text-[13.5px] font-semibold" style={{ color: SUB }}>
        <ChevronLeftIcon className="size-[17px]" /> Items
      </button>

      {/* Header card */}
      <Card pad={22} className="mb-6">
        <div className="flex gap-5">
          <ItemPhoto
            item={item}
            homeId={homeId}
            Glyph={Glyph}
            onItemUpdate={onItemUpdate}
            className="size-[132px] shrink-0 rounded-2xl"
            glyphClassName="size-[58px]"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5">
              <h1 className="m-0 text-[25px] font-extrabold tracking-[-0.5px]" style={{ color: INK }}>{item.display_name}</h1>
              {recallFound ? (
                <span className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-bold" style={{ background: SLATE_SOFT, color: SLATE }}>
                  <MegaphoneIcon className="size-3" /> Safety notice
                </span>
              ) : item.recall_status === "none_found" ? (
                // Only after a check actually ran — a null status means we never
                // looked, and claiming otherwise asserts an unverified safety fact.
                <span className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-bold" style={{ background: TEAL_WASH, color: TEAL }}>
                  <ShieldCheckIcon className="size-3" /> No recalls
                </span>
              ) : null}
            </div>
            {(item.brand || item.model) && (
              <div className="mb-4 mt-1 text-[13.5px]" style={{ color: SUB }}>{[item.brand, item.model].filter(Boolean).join(" · ")}</div>
            )}
            {shownHeaderFields.length > 0 && (
              <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
                {shownHeaderFields.map(([k, v, mono]) => <Field key={k} label={k} value={v} mono={mono} />)}
              </div>
            )}
          </div>
          <div className="flex shrink-0 flex-col gap-2">
            <button onClick={onEdit} className="inline-flex items-center gap-1.5 rounded-[11px] border px-3.5 py-2 text-[13px] font-bold" style={{ borderColor: "var(--hh-line2)", color: INK }}>
              <PencilIcon className="size-[14px]" /> Edit
            </button>
            <button onClick={goAsk} className="inline-flex items-center gap-1.5 rounded-[11px] border px-3.5 py-2 text-[13px] font-bold" style={{ borderColor: "var(--hh-line2)", color: INK }}>
              <SparklesIcon className="size-[14px]" /> Ask
            </button>
          </div>
        </div>
      </Card>

      {recallFound && (
        <div className="mb-6 rounded-2xl border p-4" style={{ background: "var(--hh-slate-soft)", borderColor: "#DBE6EF" }}>
          <div className="flex items-start gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-[10px] border bg-[var(--hh-surface)]" style={{ borderColor: "#DBE6EF" }}>
              <MegaphoneIcon className="size-[18px]" style={{ color: SLATE }} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-0.5 text-[10.5px] font-bold uppercase tracking-[0.5px]" style={{ color: SLATE }}>Safety notice</div>
              <div className="text-[15px] font-bold tracking-[-0.2px]" style={{ color: INK }}>Possible recall</div>
              {item.recall_notes && <div className="mt-1 text-[13px] leading-snug" style={{ color: "#5A6863" }}>{item.recall_notes}</div>}
            </div>
          </div>
        </div>
      )}

      {/* main + rail */}
      <div className="grid items-start gap-6" style={{ gridTemplateColumns: "minmax(0,1.7fr) minmax(260px,1fr)" }}>
        {/* MAIN: tabs */}
        <div>
          <div className="mb-4 flex gap-1" style={{ borderBottom: `1px solid ${LINE}` }}>
            {visibleTabs.map((tb) => {
              const on = tab === tb.id
              return (
                <button
                  key={tb.id}
                  onClick={() => setTab(tb.id)}
                  className="flex items-center gap-1.5 px-3.5 py-2.5 text-[14px]"
                  style={{ borderBottom: `2px solid ${on ? TEAL : "transparent"}`, color: on ? INK : SUB, fontWeight: on ? 700 : 500, marginBottom: -1 }}
                >
                  {tb.label}
                  {tb.n > 0 && <span className="text-[11px]" style={{ color: FAINT, fontFamily: "ui-monospace, monospace" }}>{tb.n}</span>}
                </button>
              )
            })}
          </div>

          {tab === "tasks" && (
            <CareBlock
              item={item}
              homeId={homeId}
              tasks={tasks}
              chunks={chunks}
              hasManual={hasManual}
              onOpenManualPage={onOpenManualPage}
              onItemUpdate={onItemUpdate}
              onAddManual={() => manualSectionProps.setAddManualOpen(true)}
            />
          )}
          {tab === "guides" && <GuidesTab howTo={howToChunks} cleaning={cleaningChunks} onAsk={goAsk} itemName={item.display_name} onOpenManualPage={onOpenManualPage} />}
          {tab === "fix" && <FixTab trouble={troubleChunks} onAsk={goAsk} onOpenManualPage={onOpenManualPage} onFindPro={() => navigate("/providers")} />}
          {tab === "saved" && <SavedTab faqs={faqs} />}
          {tab === "activity" && (
            <div className="[&_section]:bg-[var(--hh-surface)]">
              <HistorySection homeId={homeId} itemId={item.item_unit_id} refreshKey={historyKey} />
            </div>
          )}
        </div>

        {/* RAIL */}
        <div className="flex flex-col gap-4">
          {/* Warranty — status-first */}
          <WarrantyPanel item={item} homeId={homeId} onEdit={onEdit} onItemUpdate={onItemUpdate} />

          {/* Manuals — reuse the existing manager/list (renders its own card) */}
          <ManualSection {...manualSectionProps} />

          {/* Specs — concise key→value pairs only */}
          {specRows.length > 0 && (
            <Card>
              <SectionLabel>Specs</SectionLabel>
              <div className="flex flex-col">
                {specRows.map((s, i) => (
                  <div key={s.label} className="flex justify-between gap-4 py-2 text-[13px]" style={{ borderTop: i ? `1px solid ${LINE}` : "none" }}>
                    <span style={{ color: SUB }}>{s.label}</span>
                    <span className="text-right font-semibold tabular-nums" style={{ color: INK, fontFamily: "ui-monospace, monospace" }}>{s.value}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Tags */}
          {item.tags && item.tags.length > 0 && (
            <Card>
              <SectionLabel>Tags</SectionLabel>
              <div className="flex flex-wrap gap-2">
                {item.tags.map((tg) => (
                  <span key={tg} className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12.5px] font-semibold" style={{ borderColor: "var(--hh-line2)", color: SUB }}>
                    <TagIcon className="size-[11px]" style={{ color: TEAL }} /> {tg}
                  </span>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
