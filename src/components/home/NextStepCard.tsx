/**
 * Home's one next-step card for an early home (design/day-one-home.md; owner
 * approved the mock 2026-11-19).
 *
 * Which card, in order:
 *   1. no items and not dismissed here → "What's in your home?" A tap SELECTS
 *      an appliance and shows its typical care; nothing is written until Add.
 *   2. otherwise, while there is a question worth asking → one question.
 *      Yes saves the fact and offers what it unlocks; nothing is added until Add.
 *   3. otherwise, no items → "Snap a label" (the D8 card). Otherwise nothing.
 *
 * Once the appliances card has shown in this visit it stays until the person
 * dismisses it, so adding the first appliance does not swap the card out from
 * under their thumb. The parent keys this by home id.
 */
import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import useSWR from "swr"
import { CameraIcon, CheckIcon, Loader2Icon } from "lucide-react"
import { addLibraryTask, dismissLibrarySuggestion } from "@/modules/care"
import { upsertHomeProfile } from "@/modules/home"
import { InlineError } from "@/components/layout/LoadStates"
import { track } from "@/lib/analytics"
import { localToday } from "../../../shared/dates/calendar"
import { firstDueDates } from "../../../shared/care/firstList"
import type { CareEntry, CareFacts } from "../../../shared/care/library"
import { appliancesToOffer, applianceCare, exactModelsTarget, nextQuestion, type Appliance, type CareRow } from "../../../shared/care/dayOne"
import { createApplianceItem, dayOneKey, dismissKey, fetchDayOne, readLocal, writeLocal, type DayOneData } from "./dayOneData"

const INK = "var(--hh-ink)", SUB = "var(--hh-sub)", TEAL = "var(--hh-teal)", LINE = "var(--hh-line2)", SURFACE = "var(--hh-surface)"

// ── per-device conveniences (design doc: never state that must persist) ──────

const skipKey = (homeId: string) => `hh.dayOne.skipped.${homeId}`
const readSkipped = (homeId: string): string[] => {
  const raw = readLocal(skipKey(homeId))
  if (!raw) return []
  try {
    const v: unknown = JSON.parse(raw)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []
  } catch {
    // A corrupt value is the same as none.
    return []
  }
}

/** Checked essentials start this week, as the first minute's list does; the rest one cadence out. */
async function addEntries(homeId: string, itemUnitId: string | null, entries: CareEntry[]): Promise<{ added: CareEntry[]; failed: CareEntry[]; error: string | null }> {
  const due = firstDueDates(localToday(), entries.length)
  const added: CareEntry[] = []
  const failed: CareEntry[] = []
  let error: string | null = null
  for (const [i, e] of entries.entries()) {
    const res = await addLibraryTask(homeId, itemUnitId, e, e.priorityTier === "essential" ? { firstDue: due[i] } : {})
    if (res.error) {
      failed.push(e)
      error = res.error.message
    } else added.push(e)
  }
  return { added, failed, error }
}

// ── the card ────────────────────────────────────────────────────────────────

export function NextStepCard({ homeId, totalItems, onChanged }: {
  homeId: string
  totalItems: number
  /** A write landed: Home re-reads its list. */
  onChanged: () => void
}) {
  const { data, error, mutate } = useSWR(dayOneKey(homeId), () => fetchDayOne(homeId), { revalidateOnFocus: false })
  const [dismissed, setDismissed] = useState(() => readLocal(dismissKey(homeId)) === "1")
  const [skipped, setSkipped] = useState(() => readSkipped(homeId))
  // Once the person has tapped a chip, the appliances card stays for this
  // visit (adding the first appliance must not swap it out from under their
  // thumb). Only a tap pins it: pinning on sight would pin it on a warm-cache
  // "0 items" that the fresh read is about to correct.
  const [appliancesPinned, setAppliancesPinned] = useState(false)

  if (error) {
    return (
      <section className="rounded-2xl px-5 py-4" style={{ background: "var(--hh-teal-wash)" }}>
        <InlineError onRetry={() => void mutate()}>Couldn't load suggestions for your home.</InlineError>
      </section>
    )
  }
  if (!data) return null

  const offers = appliancesToOffer(data.items)
  // Both counts must say none: Home's (which can be a warm-cache snapshot)
  // and this card's own read.
  const showAppliances = !dismissed && (appliancesPinned || (totalItems === 0 && data.items.length === 0 && offers.length > 0))

  const refreshAll = async () => {
    onChanged()
    await mutate()
  }

  if (showAppliances) {
    return (
      <AppliancesCard
        homeId={homeId}
        data={data}
        onAdded={refreshAll}
        onEngaged={() => setAppliancesPinned(true)}
        onDismiss={() => {
          writeLocal(dismissKey(homeId), "1")
          setDismissed(true)
        }}
      />
    )
  }

  const q = nextQuestion(data.facts, { ...data.ctx, skipped })
  if (q) {
    return (
      <QuestionCard
        key={q.fact}
        homeId={homeId}
        facts={data.facts}
        question={q}
        onAnswered={refreshAll}
        onSkip={() => {
          const next = [...skipped, q.fact]
          writeLocal(skipKey(homeId), JSON.stringify(next))
          setSkipped(next)
          track("home_question_answered", { fact: q.fact, answer: "not_sure" })
        }}
      />
    )
  }
  return totalItems === 0 ? <SnapLabelCard /> : null
}

// ── "What's in your home?" ──────────────────────────────────────────────────

function AppliancesCard({ homeId, data, onAdded, onEngaged, onDismiss }: {
  homeId: string
  data: DayOneData
  onAdded: () => Promise<void>
  /** The first chip tap: keep this card for the rest of the visit. */
  onEngaged: () => void
  onDismiss: () => void
}) {
  const navigate = useNavigate()
  const [showMore, setShowMore] = useState(false)
  const [selected, setSelected] = useState<Appliance | null>(null)
  /** Kinds added in this visit: their chips stay, checked. */
  const [added, setAdded] = useState<Appliance[]>([])
  /** The items made in this visit, so Add My Exact Models opens the one she
   *  just added instead of starting a second (before-friends B4, Codex). */
  const [createdIds, setCreatedIds] = useState<string[]>([])
  const [confirm, setConfirm] = useState<string | null>(null)

  const offers = appliancesToOffer(data.items)
  const chips = [...added.filter((a) => !offers.some((o) => o.kind === a.kind)), ...offers]
  const visible = chips.filter((a) => !a.more || showMore || added.some((x) => x.kind === a.kind))
  const hasMore = chips.some((a) => a.more) && !showMore

  return (
    <section aria-labelledby="day-one-appliances" data-testid="appliances-card" data-tour-halt="" className="rounded-2xl px-5 py-5" style={{ background: "var(--hh-teal-wash)" }}>
      <h2 id="day-one-appliances" className="text-[1.0625rem] font-extrabold tracking-[-0.015em]" style={{ color: INK }}>
        What's in your home?
      </h2>
      <p className="mt-1.5 text-[0.875rem] leading-snug" style={{ color: SUB }}>
        Tap what you have to get its typical care. Snap its label later for the exact schedule.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {visible.map((a) => {
          const isAdded = added.some((x) => x.kind === a.kind)
          const isSelected = selected?.kind === a.kind
          return (
            <button
              key={a.kind}
              type="button"
              disabled={isAdded}
              aria-pressed={isSelected || isAdded}
              onClick={() => { onEngaged(); setConfirm(null); setSelected(isSelected ? null : a) }}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-[0.875rem] font-medium"
              style={isSelected || isAdded
                ? { background: "var(--hh-teal-fill)", borderColor: "var(--hh-teal-fill)", color: "var(--hh-on-fill)" }
                : { background: SURFACE, borderColor: LINE, color: INK }}
            >
              {isAdded && <CheckIcon className="size-3.5" strokeWidth={3} aria-hidden />}
              {a.label}
            </button>
          )
        })}
        {hasMore && (
          <button type="button" onClick={() => setShowMore(true)} className="inline-flex min-h-11 items-center rounded-full border px-3.5 text-[0.875rem] font-medium" style={{ background: SURFACE, borderColor: LINE, color: INK }}>
            More…
          </button>
        )}
      </div>

      {selected && (
        <AppliancePanel
          key={selected.kind}
          homeId={homeId}
          appliance={selected}
          rows={applianceCare(selected, data.ctx)}
          facts={data.facts}
          onCancel={() => setSelected(null)}
          // Recorded the moment the item exists, so a task that then fails
          // still leaves Add My Exact Models opening this item, not a second one.
          onItemCreated={(id) => setCreatedIds((ids) => (ids.includes(id) ? ids : [...ids, id]))}
          onDone={async (taskCount, itemId) => {
            setAdded((xs) => [...xs, selected])
            setCreatedIds((ids) => (ids.includes(itemId) ? ids : [...ids, itemId]))
            setSelected(null)
            setConfirm(`Added your ${selected.label.toLowerCase()}${taskCount ? ` with ${taskCount} ${taskCount === 1 ? "task" : "tasks"}` : ""}.`)
            await onAdded()
          }}
        />
      )}

      {confirm && <p role="status" className="mt-3 text-[0.875rem] font-medium" style={{ color: TEAL }}>{confirm}</p>}

      {/* D5: this card keeps its design; only its footer matches the empty-Home
          card's Option A. The target is computed on the tap. */}
      <button
        type="button"
        onClick={() => navigate(exactModelsTarget(createdIds, selected ? [selected.kind] : []))}
        className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-full border px-5 text-[0.9375rem] font-bold"
        style={{ background: SURFACE, borderColor: TEAL, color: TEAL }}
      >
        Add My Exact Models
      </button>
      <p className="mt-1.5 text-center text-[0.8125rem] leading-snug" style={{ color: SUB }}>
        Brand and model, or the manual, gets you the maker's schedule.
      </p>
      <div className="mt-1 flex justify-center">
        <button type="button" onClick={onDismiss} className="hit-44 min-h-11 px-1 text-[0.875rem] font-semibold" style={{ color: SUB }}>
          {added.length > 0 ? "Done" : "Not now"}
        </button>
      </div>
    </section>
  )
}

function AppliancePanel({ homeId, appliance, rows, facts, onCancel, onItemCreated, onDone }: {
  homeId: string
  appliance: Appliance
  rows: CareRow[]
  facts: CareFacts
  onCancel: () => void
  onItemCreated: (itemId: string) => void
  /** Every checked task is in: how many, and the item they are on. */
  onDone: (taskCount: number, itemId: string) => Promise<void>
}) {
  const [checked, setChecked] = useState(() => new Set(rows.filter((r) => r.checked).map((r) => r.entry.key)))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // After a half-failed add: the item exists; a retry adds only what is left.
  const [itemId, setItemId] = useState<string | null>(null)
  const [done, setDone] = useState<Set<string>>(() => new Set())

  const pending = rows.filter((r) => checked.has(r.entry.key) && !done.has(r.entry.key)).map((r) => r.entry)
  const name = appliance.label.toLowerCase()
  const label = itemId
    ? `Add ${pending.length} ${pending.length === 1 ? "task" : "tasks"}`
    : `Add ${name}${pending.length ? ` and ${pending.length} ${pending.length === 1 ? "task" : "tasks"}` : ""}`

  const add = async () => {
    setSaving(true)
    setError(null)
    let id = itemId
    if (!id) {
      const created = await createApplianceItem(homeId, appliance)
      if (created.error || !created.data) {
        setSaving(false)
        setError(created.error?.message ?? `Couldn't add your ${name}.`)
        return
      }
      id = created.data.item_unit_id
      setItemId(id)
      onItemCreated(id)
      if (appliance.fact && facts[appliance.fact] !== true) {
        const saved = await upsertHomeProfile(homeId, { care_facts: { ...facts, [appliance.fact]: true } })
        // The item and its tasks do not depend on this; the question card will
        // simply still ask. Logged, not shown.
        if (saved.error) console.warn(`[day-one] could not record ${appliance.fact} for home ${homeId}:`, saved.error.message)
      }
    }
    const res = await addEntries(homeId, id, pending)
    setDone((d) => new Set([...d, ...res.added.map((e) => e.key)]))
    setSaving(false)
    if (res.failed.length) {
      setError(`Your ${name} is added, but ${res.failed.length === 1 ? "a task" : `${res.failed.length} tasks`} couldn't be. ${res.error ?? ""}`.trim())
      return
    }
    track("home_kind_added", { kind: appliance.kind, tasks: done.size + res.added.length })
    await onDone(done.size + res.added.length, id)
  }

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border" style={{ background: SURFACE, borderColor: "var(--hh-line)" }} data-testid="appliance-panel">
      <div className="flex items-center justify-between gap-2 pl-3.5 pr-1.5 pt-1.5">
        <p className="py-1.5 text-[0.875rem] font-semibold" style={{ color: INK }}>
          {rows.length ? `Typical care for a ${name}:` : `Its usual care is already on your list.`}
        </p>
        <button type="button" onClick={onCancel} disabled={saving} className="min-h-11 shrink-0 px-2 text-[0.875rem] font-semibold" style={{ color: SUB }}>
          {itemId ? "Close" : "Cancel"}
        </button>
      </div>
      {rows.map((r) => {
        const on = checked.has(r.entry.key)
        const isDone = done.has(r.entry.key)
        const e = r.entry
        const meta = [e.priorityTier === "essential" ? "Start this week" : null, e.pro ? "Call a pro" : null, e.cadenceLabel, e.pro ? null : `${e.minutes} min`].filter(Boolean).join(" · ")
        return (
          <label key={e.key} className="flex cursor-pointer items-start gap-3 px-3.5 py-2.5" style={{ borderTop: "1px solid var(--hh-line)" }}>
            <input
              type="checkbox"
              className="mt-1 size-[18px] shrink-0 accent-[var(--hh-teal)]"
              checked={on || isDone}
              disabled={isDone || saving}
              onChange={() => setChecked((s) => { const n = new Set(s); if (n.has(e.key)) n.delete(e.key); else n.add(e.key); return n })}
            />
            <span className="min-w-0">
              <span className="block text-[0.9375rem] font-semibold leading-snug" style={{ color: INK }}>{e.title}{isDone ? " · added" : ""}</span>
              <span className="block text-[0.8125rem]" style={{ color: SUB }}>{meta}</span>
            </span>
          </label>
        )
      })}
      {error && <InlineError className="px-3.5 pt-1">{error}</InlineError>}
      <div className="px-3.5 pb-3.5 pt-2.5">
        <button
          type="button"
          onClick={() => void add()}
          disabled={saving || (itemId !== null && pending.length === 0)}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full px-5 text-[0.9375rem] font-bold disabled:opacity-60"
          style={{ background: "var(--hh-teal-fill)", color: "var(--hh-on-fill)" }}
        >
          {saving && <Loader2Icon className="size-4 animate-spin" aria-hidden />}
          {label}
        </button>
      </div>
    </div>
  )
}

// ── one question ────────────────────────────────────────────────────────────

function QuestionCard({ homeId, facts, question, onAnswered, onSkip }: {
  homeId: string
  facts: CareFacts
  question: NonNullable<ReturnType<typeof nextQuestion>>
  onAnswered: () => Promise<void>
  onSkip: () => void
}) {
  const [stage, setStage] = useState<"ask" | "offer">("ask")
  const [checked, setChecked] = useState(() => new Set(question.entries.map((e) => e.key)))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const answer = async (value: boolean) => {
    setSaving(true)
    setError(null)
    const res = await upsertHomeProfile(homeId, { care_facts: { ...facts, [question.fact]: value } })
    setSaving(false)
    if (res.error) {
      setError(`Couldn't save that. ${res.error.message}`)
      return
    }
    track("home_question_answered", { fact: question.fact, answer: value ? "yes" : "no" })
    if (value) setStage("offer")
    else await onAnswered()
  }

  const add = async () => {
    setSaving(true)
    setError(null)
    const picked = question.entries.filter((e) => checked.has(e.key))
    const skipped = question.entries.filter((e) => !checked.has(e.key))
    const res = await addEntries(homeId, null, picked)
    // What they unticked is a "not for us", the same as Not now on each.
    for (const e of skipped) {
      const d = await dismissLibrarySuggestion(homeId, null, e.key)
      if (d.error) console.warn(`[day-one] could not dismiss ${e.key} for home ${homeId}:`, d.error.message)
    }
    setSaving(false)
    for (const e of res.added) track("home_question_task_added", { key: e.key })
    if (res.failed.length) {
      setError(`Couldn't add ${res.failed.map((e) => e.title.toLowerCase()).join(" and ")}. ${res.error ?? ""}`.trim())
      return
    }
    await onAnswered()
  }

  const notNow = async () => {
    setSaving(true)
    setError(null)
    for (const e of question.entries) {
      const d = await dismissLibrarySuggestion(homeId, null, e.key)
      if (d.error) {
        setSaving(false)
        setError(`Couldn't save that. ${d.error.message}`)
        return
      }
    }
    setSaving(false)
    await onAnswered()
  }

  return (
    <section aria-labelledby="day-one-question" data-testid="question-card" className="rounded-2xl px-5 py-5" style={{ background: "var(--hh-teal-wash)" }}>
      <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.6px]" style={{ color: SUB }}>About your home</p>
      <h2 id="day-one-question" className="text-[1.0625rem] font-extrabold tracking-[-0.015em]" style={{ color: INK }}>
        {question.text}
      </h2>
      {stage === "ask" ? (
        <>
          <p className="mt-1.5 text-[0.875rem] leading-snug" style={{ color: SUB }}>{question.hint}</p>
          <div className="mt-4 flex gap-2">
            {([["Yes", () => void answer(true)], ["No", () => void answer(false)], ["Not sure", onSkip]] as const).map(([text, onClick]) => (
              <button key={text} type="button" onClick={onClick} disabled={saving}
                className="min-h-11 flex-1 rounded-full border text-[0.9375rem] font-semibold disabled:opacity-60"
                style={{ background: SURFACE, borderColor: LINE, color: INK }}>
                {text}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="mt-3 overflow-hidden rounded-2xl border" style={{ background: SURFACE, borderColor: "var(--hh-line)" }}>
          {question.entries.map((e, i) => (
            <label key={e.key} className="flex cursor-pointer items-start gap-3 px-3.5 py-2.5" style={{ borderTop: i ? "1px solid var(--hh-line)" : "none" }}>
              <input type="checkbox" className="mt-1 size-[18px] shrink-0 accent-[var(--hh-teal)]" checked={checked.has(e.key)} disabled={saving}
                onChange={() => setChecked((s) => { const n = new Set(s); if (n.has(e.key)) n.delete(e.key); else n.add(e.key); return n })} />
              <span className="min-w-0">
                <span className="block text-[0.9375rem] font-semibold leading-snug" style={{ color: INK }}>{e.title}</span>
                <span className="block text-[0.8125rem]" style={{ color: SUB }}>{[e.priorityTier === "essential" ? "Start this week" : null, e.cadenceLabel, `${e.minutes} min`].filter(Boolean).join(" · ")}</span>
              </span>
            </label>
          ))}
          <div className="flex items-center gap-2 px-3.5 pb-3.5 pt-2.5">
            <button type="button" onClick={() => void add()} disabled={saving || checked.size === 0}
              className="inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-[0.9375rem] font-bold disabled:opacity-60"
              style={{ background: "var(--hh-teal-fill)", color: "var(--hh-on-fill)" }}>
              {saving && <Loader2Icon className="size-4 animate-spin" aria-hidden />}
              Add {checked.size} {checked.size === 1 ? "task" : "tasks"}
            </button>
            <button type="button" onClick={() => void notNow()} disabled={saving} className="hit-44 min-h-11 px-2 text-[0.875rem] font-semibold" style={{ color: SUB }}>
              Not now
            </button>
          </div>
        </div>
      )}
      {error && <InlineError className="mt-2">{error}</InlineError>}
    </section>
  )
}

// ── "Snap a label" (D8) ─────────────────────────────────────────────────────

/**
 * A home with tasks but no items, once the appliances card is done with — the
 * one next step is a label, and the camera opens only on this tap (D8
 * must-be-true 14).
 */
export function SnapLabelCard() {
  return (
    // data-tour-halt: like the set-up hero, this is still the first minute —
    // the tour narrates manuals and a schedule this home does not have yet.
    <section aria-labelledby="snap-label-title" data-testid="snap-label-card" data-tour-halt=""
      className="rounded-2xl px-5 py-5"
      style={{ background: "var(--hh-teal-wash)" }}>
      <h2 id="snap-label-title" className="text-[1.0625rem] font-extrabold tracking-[-0.015em]" style={{ color: INK }}>
        Get the exact schedule
      </h2>
      <p className="mt-1.5 text-[0.875rem] leading-snug" style={{ color: SUB }}>
        These are typical plans. Snap an appliance label and its manual takes over.
      </p>
      <Link
        to="/inventory/add"
        className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full px-5 py-2.5 text-[0.9375rem] font-bold"
        style={{ background: "var(--hh-teal-fill)", color: "var(--hh-on-fill)" }}
      >
        <CameraIcon className="size-4" aria-hidden />
        Snap a label
      </Link>
    </section>
  )
}
