import { useState, useMemo, useCallback, useRef, useEffect } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Loader2Icon } from "lucide-react"
import {
  reviewBucketFor,
  isScheduled,
  sortWithinBucket,
  summarize,
  isRecurring,
  REVIEW_BUCKET_ORDER,
  REVIEW_BUCKET_COPY,
  type ReviewBucket,
} from "../../../shared/tasks/reviewBuckets"
import { USAGE_TIP_TAG } from "../../../shared/tasks/taxonomy"
import { classifyActorFromText } from "@/lib/taskActor"
import type {
  PreviewChunk, PreviewResult, PreviewTask, PriorityTier, ScheduleType,
} from "@/modules/knowledge/types/previewTypes"
import { TaskReviewFeedback, type ReviewEdit, type ReviewEditSummary } from "./TaskReviewFeedback"

/**
 * The post-parse review — where a manual's extracted tasks become the user's
 * schedule, or don't.
 *
 * Two steps, because they are two different decisions: **what each task is**
 * (and whether it belongs at all), then **how often** the ones that survive
 * should repeat. Sections come from reviewBuckets — schedule first, priority
 * second — and each section header states its consequence, since leaving a task
 * where it sits IS the agreement to be notified about it.
 *
 * Principle in play (CLAUDE.md, "Suggest, never assume"): every value we chose is
 * visible and changeable, skipping is explicit and reversible, nothing is
 * scheduled without the user seeing that it will be, and "these don't look right"
 * is always one tap away.
 */

const KINDS = [
  { id: "maintenance", icon: "🔧", label: "Maintenance", hint: "upkeep" },
  { id: "cleaning", icon: "🧽", label: "Cleaning", hint: "freshness" },
  { id: "tip", icon: "💡", label: "Tip", hint: "usage" },
] as const
type RowKind = (typeof KINDS)[number]["id"]

const TIERS: { id: PriorityTier; label: string; onSched: string; offSched: string }[] = [
  { id: "essential", label: "Essential", onSched: "reminds you", offSched: "act promptly" },
  { id: "recommended", label: "Recommended", onSched: "no reminders", offSched: "worth doing" },
  { id: "optional", label: "Optional", onSched: "quiet", offSched: "if you like" },
]

const CADENCES: { id: ScheduleType; label: string }[] = [
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "quarterly", label: "Quarterly" },
  { id: "semiannual", label: "Twice a year" },
  { id: "annual", label: "Yearly" },
  { id: "seasonal", label: "Seasonal" },
]
const cadLabel = (s: ScheduleType) => CADENCES.find((c) => c.id === s)?.label ?? s
const originLabel = (s: ScheduleType) =>
  s === "setup" ? "one-time setup" : s === "as_needed" ? "as needed" : s === "after_each_use" ? "each use" : cadLabel(s)

interface ReviewRow {
  id: string
  riskLevel: string | null
  actor: string
  origin: "task" | "tip"
  title: string
  description: string | null
  justification: string | null
  minutes: number | null
  origSchedule: ScheduleType
  kind: RowKind
  tier: PriorityTier
  schedule: ScheduleType
  scheduleSuggested: boolean
  included: boolean
  task?: PreviewTask
  chunk?: PreviewChunk
}

function rowsFrom(data: PreviewResult): ReviewRow[] {
  const taskRows: ReviewRow[] = data.tasks.map((t, i) => ({
    id: `t${i}:${t.title}`,
    origin: "task",
    title: t.title,
    description: t.description,
    justification: t.justification ?? null,
    minutes: t.estimated_minutes,
    origSchedule: t.schedule_type,
    riskLevel: t.risk_level ?? null,
    actor: classifyActorFromText([t.title, t.description ?? "", t.instructions_text ?? ""].join(" ")),
    // A per-use habit is a tip: you do it at the machine, and a calendar reminder
    // for it is noise — unless it's safety work, which never auto-demotes.
    kind:
      t.schedule_type === "after_each_use" &&
      t.risk_level !== "safety" &&
      classifyActorFromText([t.title, t.description ?? "", t.instructions_text ?? ""].join(" ")) === "diy"
        ? "tip"
        : t.care_type === "cleaning" ? "cleaning" : "maintenance",
    tier: t.priority_tier,
    schedule: t.schedule_type,
    scheduleSuggested: false,
    included: true,
    task: t,
  }))
  const tipRows: ReviewRow[] = data.chunks
    .filter((c) => (c.tags ?? []).includes(USAGE_TIP_TAG))
    .map((c, i) => ({
      id: `c${i}:${c.title ?? ""}`,
      origin: "tip",
      title: c.title ?? "Tip",
      description: c.content,
      justification: null,
      minutes: null,
      origSchedule: "after_each_use" as ScheduleType,
      riskLevel: null,
      actor: "diy",
      kind: "tip" as RowKind,
      tier: "optional" as PriorityTier,
      schedule: "after_each_use" as ScheduleType,
      scheduleSuggested: false,
      included: true,
      chunk: c,
    }))
  return [...taskRows, ...tipRows]
}

const bucketOfRow = (r: ReviewRow): ReviewBucket =>
  reviewBucketFor({
    care_type: r.kind === "tip" ? "operating" : r.kind,
    priority_tier: r.tier,
    schedule_type: r.schedule,
    keep_as_task: r.kind !== "tip",
    risk_level: r.riskLevel,
    actor: r.actor,
  })

interface TaskReviewSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  itemName: string
  previewData: PreviewResult
  onSave: (tasks: PreviewTask[], chunks: PreviewChunk[]) => Promise<string | null>
  saving: boolean
  /** Fires when the user says the parse looks wrong. Carries their corrections. */
  onFeedback?: (payload: { reasons: string[]; note: string; edits: ReviewEditSummary; rescan: boolean }) => void
}

export function TaskReviewSheet({
  open, onOpenChange, itemName, previewData, onSave, saving, onFeedback,
}: TaskReviewSheetProps) {
  const initial = useMemo(() => rowsFrom(previewData), [previewData])
  const [rows, setRows] = useState<ReviewRow[]>(initial)
  const [step, setStep] = useState<1 | 2>(1)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [guideIndex, setGuideIndex] = useState<number | null>(null)
  const [walked, setWalked] = useState(false)
  const [cadOpenId, setCadOpenId] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setRows(initial); setStep(1); setExpandedId(null); setGuideIndex(null); setWalked(false); setSaveError(null)
  }, [initial])

  const patch = useCallback((id: string, next: Partial<ReviewRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...next } : r)))
  }, [])

  const counts = useMemo(() => {
    const s = summarize(rows.filter((r) => r.included).map((r) => ({
      care_type: r.kind === "tip" ? "operating" : r.kind,
      priority_tier: r.tier, schedule_type: r.schedule, keep_as_task: r.kind !== "tip",
    })))
    return { ...s, tasks: rows.filter((r) => r.included && r.kind !== "tip").length }
  }, [rows])

  const edits: ReviewEditSummary = useMemo(() => {
    const base = new Map(initial.map((r) => [r.id, r]))
    let tier = 0, kind = 0, schedule = 0, skipped = 0
    const details: ReviewEdit[] = []
    for (const r of rows) {
      const b = base.get(r.id); if (!b) continue
      if (r.tier !== b.tier) { tier++; details.push({ title: r.title, field: "tier", from: b.tier, to: r.tier }) }
      if (r.kind !== b.kind) { kind++; details.push({ title: r.title, field: "kind", from: b.kind, to: r.kind }) }
      if (r.schedule !== b.schedule) { schedule++; details.push({ title: r.title, field: "schedule", from: b.schedule, to: r.schedule }) }
      if (!r.included) { skipped++; details.push({ title: r.title, field: "skip", from: "kept", to: "skipped" }) }
    }
    return { tier, kind, schedule, skipped, total: tier + kind + schedule + skipped, details }
  }, [rows, initial])

  /** Filing something under maintenance/cleaning is asking for it to repeat — if
   *  it arrived without a cadence, suggest one so step 2 can't silently skip it. */
  const setKind = (r: ReviewRow, kind: RowKind) => {
    const next: Partial<ReviewRow> = { kind }
    if (kind !== "tip" && !isRecurring(r.schedule) && r.schedule !== "setup" && r.origSchedule === "after_each_use") {
      next.schedule = "monthly"; next.scheduleSuggested = true
    }
    patch(r.id, next)
  }

  const toggleSchedule = (r: ReviewRow) => {
    if (isScheduled(bucketOfRow(r))) patch(r.id, { schedule: "as_needed", scheduleSuggested: false })
    else patch(r.id, { schedule: "monthly", scheduleSuggested: true })
  }

  /** Expanding must not throw the reader to the top — hold the card where the
   *  finger left it, then pull the taller card into view if it overflows. */
  const expandAnchored = (id: string, el: HTMLElement | null) => {
    const root = scrollRef.current
    if (!root || !el) { setExpandedId(id); return }
    const before = el.getBoundingClientRect().top - root.getBoundingClientRect().top
    setExpandedId(id)
    requestAnimationFrame(() => {
      const now = root.querySelector<HTMLElement>("[data-expanded='true']")
      if (!now) return
      const rr = root.getBoundingClientRect()
      root.scrollTop += now.getBoundingClientRect().top - rr.top - before
      const over = now.getBoundingClientRect().bottom - rr.bottom
      if (over > 0) root.scrollTop += over + 10
    })
  }

  const handleSave = async () => {
    setSaveError(null)
    const keptTasks: PreviewTask[] = []
    const keptChunks: PreviewChunk[] = previewData.chunks.filter((c) => !(c.tags ?? []).includes(USAGE_TIP_TAG))
    for (const r of rows) {
      if (!r.included) continue
      if (r.kind === "tip") {
        keptChunks.push(
          r.chunk ?? {
            chunk_type: "how_to", title: r.title, content: r.description ?? r.title,
            tags: [USAGE_TIP_TAG], source_pages: r.task?.source_page ? [r.task.source_page] : [],
          },
        )
        continue
      }
      const base: PreviewTask = r.task ?? {
        title: r.title, description: r.description, care_type: "maintenance", priority_tier: r.tier,
        risk_level: "performance", estimated_minutes: r.minutes, schedule_type: r.schedule,
        interval_days: null, instructions_text: null, symptom_tags: [], re_check_triggers: [],
      }
      keptTasks.push({
        ...base,
        care_type: r.kind === "cleaning" ? "cleaning" : "maintenance",
        priority_tier: r.tier,
        schedule_type: r.schedule,
      })
    }
    const err = await onSave(keptTasks, keptChunks)
    if (err) setSaveError(err)
  }

  // ── rendering ──────────────────────────────────────────────────────────────
  const guideRow = guideIndex != null ? rows[guideIndex] : null

  const expandedCard = (r: ReviewRow, opts?: { onNext?: () => void }) => {
    const onSched = isScheduled(bucketOfRow(r))
    return (
      <div data-expanded="true" className="rounded-2xl border-[1.5px] p-4 mb-2 bg-card" style={{ borderColor: "var(--hh-teal, #1B6B5A)" }}>
        <div className="flex items-start gap-2">
          <div className="flex-1 text-[17px] font-extrabold tracking-[-0.02em] leading-tight text-balance">{r.title}</div>
        </div>
        {/* Badges the rest of the app already shows. Without them this screen asked
            "what is it?" while withholding the two facts that answer it. */}
        {(r.riskLevel === "safety" || r.actor !== "diy") && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {r.riskLevel === "safety" && (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ background: "var(--hh-clay-soft)", color: "var(--hh-clay)" }}>Safety</span>
            )}
            {(r.actor === "pro" || r.actor === "hazardous") && (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ background: "var(--hh-slate-soft)", color: "var(--hh-slate)" }}>Pro</span>
            )}
          </div>
        )}
        {/* The WHY. Previously only `justification` rendered, so any task carrying
            only a description showed no explanation at all — which is precisely
            when the user can't tell how to categorise it. */}
        {(r.justification || r.description) && (
          <div className="text-[13px] text-muted-foreground mt-2 leading-snug">{r.justification || r.description}</div>
        )}
        <div className="text-[11.5px] text-muted-foreground/80 mt-2">
          From the manual · {originLabel(r.origSchedule)}{r.minutes ? ` · about ${r.minutes} min` : ""}
        </div>

        <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground mt-4 mb-2">What is it?</div>
        <div className="flex gap-1.5">
          {KINDS.map((k) => (
            <button key={k.id} type="button" aria-pressed={r.kind === k.id}
              onClick={() => setKind(r, k.id)}
              className={`flex-1 flex flex-col items-center gap-1 rounded-xl border py-2 px-1 text-[11px] font-semibold transition-colors ${
                r.kind === k.id ? "border-primary bg-primary/10 text-foreground" : "border-border bg-background text-muted-foreground"}`}>
              <span className="text-[17px] leading-none">{k.icon}</span>{k.label}
              <span className="text-[10.5px] font-semibold text-muted-foreground">{k.hint}</span>
            </button>
          ))}
        </div>

        {r.kind === "tip" ? (
          <div className="mt-3 rounded-xl bg-violet-50 dark:bg-violet-950/40 px-2.5 py-2 text-[11.5px] text-violet-700 dark:text-violet-300">
            <b>Saved as a tip</b> — on the item page, never scheduled.
          </div>
        ) : (
          <>
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-border bg-background px-2.5 py-2 text-[11.5px] text-muted-foreground">
              <span>
                {onSched ? <>Repeats <b className="text-foreground">{cadLabel(r.schedule)}</b></> :
                  <><b className="text-foreground">Not on a schedule</b> — {r.schedule === "setup" ? "a one-time step" : "you'll do it when needed"}</>}
              </span>
              <button type="button" onClick={() => toggleSchedule(r)}
                className="ml-auto rounded-full border border-primary px-2.5 py-1 text-[10.5px] font-semibold text-primary whitespace-nowrap">
                {onSched ? "Take off schedule" : "Put on a schedule"}
              </button>
            </div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground mt-4 mb-2">How important?</div>
            <div className="flex gap-1.5">
              {TIERS.map((tier) => (
                <button key={tier.id} type="button" aria-pressed={r.tier === tier.id}
                  onClick={() => patch(r.id, { tier: tier.id })}
                  className={`flex-1 flex flex-col items-center gap-1 rounded-xl border py-2 px-1 text-[11px] font-semibold transition-colors ${
                    r.tier === tier.id
                      ? tier.id === "essential" ? "border-[#C2410C] bg-[#C2410C]/10 text-foreground" : "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-background text-muted-foreground"}`}>
                  <PriorityDot tier={tier.id} />{tier.label}
                  <span className="text-[10.5px] font-semibold text-muted-foreground">{onSched ? tier.onSched : tier.offSched}</span>
                </button>
              ))}
            </div>
          </>
        )}

        <div className="flex gap-2 mt-3.5">
          <button type="button" onClick={() => { patch(r.id, { included: false }); opts?.onNext ? opts.onNext() : setExpandedId(null) }}
            className="flex-1 rounded-xl border border-border py-2.5 text-[12.5px] font-bold text-muted-foreground">Skip ✕</button>
          <button type="button" onClick={() => { patch(r.id, { included: true }); opts?.onNext ? opts.onNext() : setExpandedId(null) }}
            className="flex-[2] rounded-xl bg-primary py-2.5 text-[12.5px] font-bold text-primary-foreground">
            {opts?.onNext ? "Keep →" : "Done"}
          </button>
        </div>
      </div>
    )
  }

  const collapsedRow = (r: ReviewRow) => {
    const b = bucketOfRow(r)
    return (
      <button key={r.id} type="button"
        onClick={(e) => expandAnchored(r.id, e.currentTarget)}
        className={`w-full text-left rounded-xl border px-3 py-2.5 mb-1.5 flex items-center gap-2.5 transition-colors hover:border-primary ${
          r.included ? "bg-card border-border" : "border-dashed border-border opacity-50"}`}>
        <span className="text-[14px] shrink-0 opacity-85" aria-label={r.kind}>{KINDS.find((k) => k.id === r.kind)?.icon}</span>
        <span className={`flex-1 min-w-0 text-[14px] font-semibold tracking-[-0.005em] ${r.included ? "" : "line-through text-muted-foreground"}`}>{r.title}</span>
        {r.included && isScheduled(b) && <span className="text-[10px] font-mono text-muted-foreground/70 whitespace-nowrap">{cadLabel(r.schedule)}</span>}
        {r.included && r.kind !== "tip" && <PriorityDot tier={r.tier} />}
        <span role="button" tabIndex={-1}
          onClick={(e) => { e.stopPropagation(); patch(r.id, { included: !r.included }) }}
          aria-label={r.included ? `Skip ${r.title}` : `Bring back ${r.title}`}
          className="shrink-0 text-[14px] text-muted-foreground/70 px-1 rounded hover:bg-muted">{r.included ? "✕" : "↩"}</span>
      </button>
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[92dvh] flex flex-col p-0 gap-0">
        <SheetHeader className="px-4 pt-3 pb-2 border-b">
          <SheetTitle className="text-[17px] font-extrabold tracking-[-0.02em]">{itemName}</SheetTitle>
          <div className="text-[10.5px] font-mono text-muted-foreground/70">
            {guideRow ? `Deciding each task · ${(guideIndex ?? 0) + 1} of ${rows.length}` : step === 1 ? "Step 1 of 2 · What each task is" : "Step 2 of 2 · How often"}
          </div>
        </SheetHeader>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3">
          {step === 2 ? (
            <StepTwo rows={rows} cadOpenId={cadOpenId} setCadOpenId={setCadOpenId} patch={patch} bucketOfRow={bucketOfRow} />
          ) : guideRow ? (
            <>
              <div className="flex justify-end">
                <button type="button" onClick={() => { setGuideIndex(null); setWalked(true) }}
                  className="text-[12.5px] font-semibold text-muted-foreground px-1.5 py-1">✕ Exit</button>
              </div>
              <div className="text-center text-[10.5px] font-mono font-bold text-muted-foreground/70 tracking-wider mb-1.5">
                {guideIndex! + 1} of {rows.length}
              </div>
              <div className="h-1 bg-muted rounded mb-3 overflow-hidden">
                <div className="h-full bg-primary transition-[width]" style={{ width: `${(guideIndex! / rows.length) * 100}%` }} />
              </div>
              {expandedCard(guideRow, {
                onNext: () => {
                  const next = guideIndex! + 1
                  if (next >= rows.length) { setGuideIndex(null); setWalked(true) } else setGuideIndex(next)
                  scrollRef.current?.scrollTo({ top: 0 })
                },
              })}
            </>
          ) : (
            <>
              <div className="text-[13px] mb-3.5">
                {walked ? (
                  <><b className="font-bold">{rows.length} task{rows.length === 1 ? "" : "s"}</b> from this manual. Tap any one to change it — or walk them again.</>
                ) : (
                  <>
                    We found <b className="font-bold">{rows.length} things</b> worth tracking.{" "}
                    <b className="font-bold">{counts.scheduled}</b> {counts.scheduled === 1 ? "goes" : "go"} on your schedule — the rest are setup steps and tips.
                    <span className="block text-muted-foreground mt-0.5">Tap any task below to review and change it, or take them one at a time.</span>
                  </>
                )}
                <div className="mt-2.5">
                  <button type="button" onClick={() => { setGuideIndex(0); scrollRef.current?.scrollTo({ top: 0 }) }}
                    className="rounded-xl bg-primary px-3.5 py-2.5 text-[12.5px] font-bold text-primary-foreground">
                    Go through them one by one{walked ? " again" : ""} →
                  </button>
                </div>
              </div>

              {REVIEW_BUCKET_ORDER.map((bucket, i) => {
                const copy = REVIEW_BUCKET_COPY[bucket]
                const items = sortWithinBucket(bucket, rows.filter((r) => bucketOfRow(r) === bucket) as never) as ReviewRow[]
                if (!items.length && !copy.empty) return null
                const prevSec = i > 0 ? isScheduled(REVIEW_BUCKET_ORDER[i - 1]) : null
                const showRule = i === 0 || prevSec !== isScheduled(bucket)
                return (
                  <div key={bucket}>
                    {showRule && (
                      <div className="flex items-center gap-2.5 mt-5 mb-1 first:mt-1">
                        <span className="text-[9.5px] font-mono font-bold uppercase tracking-[0.14em] text-muted-foreground/70 whitespace-nowrap">
                          {isScheduled(bucket) ? "On your schedule" : "Not scheduled"}
                        </span>
                        <i className="flex-1 h-px bg-border" />
                      </div>
                    )}
                    <div className="mt-3.5 mb-2">
                      <div className="flex items-center gap-2 text-[15px] font-extrabold tracking-[-0.015em]">
                        <span className="text-[16px] w-[17px] text-center">{copy.icon}</span>{copy.title}
                        <span className="ml-auto text-[11px] font-mono font-bold text-muted-foreground/70">{items.length}</span>
                      </div>
                      <div className="text-[11.5px] text-muted-foreground mt-0.5 pl-6">{copy.sub}</div>
                    </div>
                    {items.length === 0
                      ? <div className="text-[11.5px] text-muted-foreground/70 pl-6 pb-1">{copy.empty}</div>
                      : items.map((r) => (expandedId === r.id ? <div key={r.id}>{expandedCard(r)}</div> : collapsedRow(r)))}
                  </div>
                )
              })}

              <TaskReviewFeedback edits={edits} onSubmit={(p) => onFeedback?.(p)} />
            </>
          )}
          {saveError && <p className="text-sm text-destructive mt-3">{saveError}</p>}
        </div>

        <div className="border-t px-4 py-3 pb-5 flex items-center gap-2.5">
          {step === 2 && (
            <Button variant="ghost" onClick={() => { setStep(1); scrollRef.current?.scrollTo({ top: 0 }) }}>‹ Back</Button>
          )}
          <Button className="flex-1 font-bold" disabled={saving} onClick={() => {
            if (step === 1 && counts.scheduled > 0) {
              setGuideIndex(null); setWalked(true); setStep(2); scrollRef.current?.scrollTo({ top: 0 })
            } else void handleSave()
          }}>
            {saving && <Loader2Icon className="size-4 mr-2 animate-spin" />}
            {step === 1 && counts.scheduled > 0
              ? `Next: schedule ${counts.scheduled} task${counts.scheduled === 1 ? "" : "s"} →`
              : `Save ${counts.tasks} task${counts.tasks === 1 ? "" : "s"}${counts.tips ? ` · ${counts.tips} tip${counts.tips === 1 ? "" : "s"}` : ""}`}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function PriorityDot({ tier }: { tier: PriorityTier }) {
  const cls = tier === "essential" ? "size-[11px] bg-[#C2410C]"
    : tier === "recommended" ? "size-[10px] bg-primary"
    : "size-[10px] border-2 border-slate-400"
  return <span className={`inline-block rounded-full shrink-0 ${cls}`} aria-label={tier} />
}

function StepTwo({
  rows, cadOpenId, setCadOpenId, patch, bucketOfRow,
}: {
  rows: ReviewRow[]
  cadOpenId: string | null
  setCadOpenId: (id: string | null) => void
  patch: (id: string, next: Partial<ReviewRow>) => void
  bucketOfRow: (r: ReviewRow) => ReviewBucket
}) {
  const scheduled = rows.filter((r) => r.included && isScheduled(bucketOfRow(r)))
  if (!scheduled.length) {
    return <div className="text-[12px] text-muted-foreground px-1 py-2">Nothing is on a schedule — nothing will remind you.</div>
  }
  return (
    <>
      <div className="text-[13px] mb-3">How often should these repeat?</div>
      {(["essential", "recommended", "optional"] as const).map((tier) => {
        const items = scheduled.filter((r) => r.tier === tier)
        if (!items.length) return null
        const copy = REVIEW_BUCKET_COPY[tier]
        return (
          <div key={tier}>
            <div className="mt-3.5 mb-2">
              <div className="flex items-center gap-2 text-[15px] font-extrabold tracking-[-0.015em]">
                <span className="text-[16px] w-[17px] text-center">{copy.icon}</span>{copy.title}
                <span className="ml-auto text-[11px] font-mono font-bold text-muted-foreground/70">{items.length}</span>
              </div>
              <div className="text-[11.5px] text-muted-foreground mt-0.5 pl-6">{copy.sub}</div>
            </div>
            {items.map((r) => (
              <div key={r.id} className="rounded-xl border border-border bg-card px-3 py-2.5 mb-1.5">
                <div className="flex items-center gap-2.5">
                  <span className="text-[14px] opacity-85">{KINDS.find((k) => k.id === r.kind)?.icon}</span>
                  <span className="flex-1 min-w-0 text-[14px] font-semibold">{r.title}</span>
                  <button type="button" onClick={() => setCadOpenId(cadOpenId === r.id ? null : r.id)}
                    className="rounded-full border border-border bg-background px-2.5 py-1.5 text-[11px] font-semibold whitespace-nowrap">
                    {cadLabel(r.schedule)}{r.scheduleSuggested ? " · suggested" : ""} ▾
                  </button>
                </div>
                {cadOpenId === r.id && (
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    {CADENCES.map((c) => (
                      <button key={c.id} type="button" aria-pressed={r.schedule === c.id}
                        onClick={() => { patch(r.id, { schedule: c.id, scheduleSuggested: false }); setCadOpenId(null) }}
                        className={`rounded-full border px-2.5 py-1.5 text-[11px] font-semibold ${
                          r.schedule === c.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground"}`}>
                        {c.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      })}
    </>
  )
}
