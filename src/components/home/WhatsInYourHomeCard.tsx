/**
 * "What's in your home?" on an EMPTY Home (no items, no tasks) — before-friends
 * mock 1 (owner approved 2026-11-24, Option A; shots r3-m1-a/b/c, r4-m1-optA,
 * r4-m1-collapsed). It takes the place of "Let's set up your home".
 *
 * Three states, one responsive component for phone and desktop:
 *   1. Pick — chips in three groups. A tap selects; nothing is written.
 *   2. Care — "Suggested for your home": one row per task the picks offer, each
 *      with its own Add. Nothing is created until that Add (suggest, never
 *      assume). A ticked appliance becomes an item with its first task (D1).
 *   3. Collapsed — after Not now (or Done with nothing added, D9): one line in
 *      the card's place that brings the card back.
 *
 * The card's own read decides whether this home is really empty: Home's stats
 * can be the PREVIOUS home's for a moment (useDashboard keeps previous data
 * and its core read does not check the home id). Until the read answers,
 * every button is disabled; if it says the home has anything and she has not
 * engaged, the card renders nothing and Home's own data catches up.
 */
import { useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import useSWR from "swr"
import { CheckIcon, ChevronRightIcon, Loader2Icon } from "lucide-react"
import { softDeleteItemUnit } from "@/modules/items"
import { addLibraryTask } from "@/modules/care"
import { upsertHomeProfile } from "@/modules/home"
import { InlineError } from "@/components/layout/LoadStates"
import { track } from "@/lib/analytics"
import { localToday } from "../../../shared/dates/calendar"
import { firstDueDates } from "../../../shared/care/firstList"
import type { CareFacts, CareKind } from "../../../shared/care/library"
import { careForPicks, exactModelsTarget, HOME_PICK_GROUPS, type HomeContext, type HomePick, type PickCareRow } from "../../../shared/care/dayOne"
import { collapsedKey, createApplianceItem, dayOneKey, dismissKey, fetchDayOne, readLocal, removeLocal, writeLocal } from "./dayOneData"

const INK = "var(--hh-ink)", SUB = "var(--hh-sub)", TEAL = "var(--hh-teal)", LINE = "var(--hh-line)", LINE2 = "var(--hh-line2)", SURFACE = "var(--hh-surface)"
const FILLED = { background: "var(--hh-teal-fill)", color: "var(--hh-on-fill)" }
const OUTLINED = { background: SURFACE, borderColor: TEAL, color: TEAL }

const ALL_PICKS = HOME_PICK_GROUPS.flatMap((g) => g.picks)
const pickById = (id: string) => ALL_PICKS.find((p) => p.id === id)

type Stage = "pick" | "care" | "collapsed"

export function WhatsInYourHomeCard({ homeId, onEngaged, onFinished }: {
  homeId: string
  /** She has started (See Suggested Care, on a home the read confirmed empty): keep the card while she adds. */
  onEngaged: () => void
  /** Done: Home may show whatever it now is. */
  onFinished: () => void
}) {
  const navigate = useNavigate()
  const { data, error, mutate } = useSWR(dayOneKey(homeId), () => fetchDayOne(homeId), { revalidateOnFocus: false })
  const [stage, setStage] = useState<Stage>(() => (readLocal(collapsedKey(homeId)) === "1" ? "collapsed" : "pick"))
  const [ticked, setTicked] = useState<string[]>([])
  const [showMore, setShowMore] = useState(false)
  const [engaged, setEngaged] = useState(false)
  const [savingFacts, setSavingFacts] = useState(false)
  const [pickError, setPickError] = useState<string | null>(null)
  const [savedFacts, setSavedFacts] = useState(false)
  /** What the home had when she first saw her care, so a row she adds in this
   *  visit stays on the list (reading "Added") instead of counting as covered. */
  const [baseCtx, setBaseCtx] = useState<HomeContext | null>(null)
  /** One write at a time: two taps can never create two items. */
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [addedKeys, setAddedKeys] = useState<string[]>([])
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
  /** The items made in this visit, by kind: a second row of the same appliance reuses its item. */
  const [created, setCreated] = useState<Map<CareKind, string>>(() => new Map())
  const [essentialsAdded, setEssentialsAdded] = useState(0)
  /** The facts as last written here — never a stale read spread over a fresh write. */
  const factsRef = useRef<CareFacts | null>(null)

  const ready = !!data && data.homeId === homeId
  const confirmedEmpty = ready && data.items.length === 0 && data.taskCount === 0
  // Not empty and not engaged: render nothing; Home's data catches up and replaces this branch.
  if (ready && !confirmedEmpty && !engaged) return null

  const picks = ticked.map((id) => pickById(id)).filter((p): p is HomePick => !!p)
  const tickedKinds = picks.flatMap((p) => (p.type === "appliance" ? [p.appliance.kind] : []))

  const collapse = () => {
    writeLocal(collapsedKey(homeId), "1")
    setStage("collapsed")
  }

  if (stage === "collapsed") {
    return (
      <section data-testid="empty-home-collapsed" data-tour-halt="" className="mx-auto w-full max-w-[560px]">
        <button
          type="button"
          onClick={() => {
            removeLocal(collapsedKey(homeId))
            setStage("pick")
          }}
          className="flex min-h-11 w-full items-center gap-3 rounded-2xl border px-6 py-6 text-left shadow-sm"
          style={{ background: SURFACE, borderColor: LINE }}
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[1.0625rem] font-bold leading-snug" style={{ color: TEAL }}>Tell us what's in your home</span>
            <span className="mt-1 block text-[0.9375rem] leading-snug" style={{ color: SUB }}>You can add a model or manual anytime in Items.</span>
          </span>
          <ChevronRightIcon className="size-5 shrink-0" style={{ color: TEAL }} aria-hidden />
        </button>
      </section>
    )
  }

  const seeCare = async () => {
    if (!data) return
    setPickError(null)
    const facts = picks.flatMap((p) => (p.type === "fact" ? [p.fact] : []))
    let current: CareFacts = factsRef.current ?? data.facts
    if (facts.length) {
      // Ticked facts only, and only as true: not ticking a chip is not "no".
      const next: CareFacts = { ...current }
      for (const f of facts) next[f] = true
      setSavingFacts(true)
      const res = await upsertHomeProfile(homeId, { care_facts: next })
      setSavingFacts(false)
      if (res.error) {
        setPickError(`Couldn't save that. ${res.error.message}`)
        return
      }
      current = next
      setSavedFacts(true)
    }
    factsRef.current = current
    if (!baseCtx) setBaseCtx(data.ctx)
    setStage("care")
    void mutate()
    if (!engaged) {
      setEngaged(true)
      onEngaged()
    }
  }

  const add = async (row: PickCareRow) => {
    const pick = pickById(row.pickId)
    if (!pick || busyKey) return
    const key = row.entry.key
    setBusyKey(key)
    setRowErrors((e) => {
      const next = { ...e }
      delete next[key]
      return next
    })
    const fail = (message: string) => setRowErrors((e) => ({ ...e, [key]: message }))
    const essential = row.entry.priorityTier === "essential"
    // The Saturday-then-Sunday spread the first minute's list uses: the first
    // essential added in this visit starts on the first day, every later one on the second.
    const opts = essential ? { firstDue: firstDueDates(localToday(), 2)[essentialsAdded > 0 ? 1 : 0] } : {}
    try {
      if (pick.type === "fact") {
        const res = await addLibraryTask(homeId, null, row.entry, opts)
        if (res.error) return fail(`Couldn't add that. ${res.error.message}`)
        track("home_question_task_added", { key })
      } else {
        const { appliance } = pick
        let itemId = created.get(appliance.kind) ?? null
        let madeNow = false
        if (!itemId) {
          const made = await createApplianceItem(homeId, appliance)
          if (made.error || !made.data) return fail(`Couldn't add that. ${made.error?.message ?? "Try again."}`)
          itemId = made.data.item_unit_id
          madeNow = true
        }
        const res = await addLibraryTask(homeId, itemId, row.entry, opts)
        if (res.error) {
          if (!madeNow) return fail(`Couldn't add that. ${res.error.message}`)
          // No item may be left with zero tasks (Codex): take back the one this
          // tap made, so a retry makes exactly one.
          const back = await softDeleteItemUnit(homeId, itemId)
          if (back.success) return fail("Couldn't add that. Try again.")
          console.error(
            `[empty-home] home ${homeId}: item ${itemId} (${appliance.kind}) was made, its task failed (${res.error.message}), and taking the item back failed too (${back.error})`,
          )
          const kept = itemId
          setCreated((m) => new Map(m).set(appliance.kind, kept))
          return fail(`Your ${appliance.label.toLowerCase()} is added, but this task couldn't be. Try again.`)
        }
        if (madeNow) {
          const kept = itemId
          setCreated((m) => new Map(m).set(appliance.kind, kept))
          track("home_kind_added", { kind: appliance.kind, tasks: 1 })
        }
        // The appliance's fact, only once its task is in.
        const facts = factsRef.current ?? data?.facts ?? {}
        if (appliance.fact && facts[appliance.fact] !== true) {
          const next = { ...facts, [appliance.fact]: true }
          const saved = await upsertHomeProfile(homeId, { care_facts: next })
          // The item and its task do not depend on this; a later question may
          // simply ask again. Logged, not shown.
          if (saved.error) console.warn(`[empty-home] could not record ${appliance.fact} for home ${homeId}:`, saved.error.message)
          else factsRef.current = next
        }
      }
      setAddedKeys((ks) => [...ks, key])
      if (essential) setEssentialsAdded((n) => n + 1)
    } finally {
      setBusyKey(null)
    }
  }

  const done = () => {
    // So the old appliances card does not re-ask on this phone a second later.
    writeLocal(dismissKey(homeId), "1")
    // Nothing added: the home is still empty, so the card keeps its place as one line (D9).
    if (addedKeys.length === 0) collapse()
    onFinished()
  }

  if (stage === "care") {
    const rows = careForPicks(picks, baseCtx ?? data?.ctx ?? { existingTitles: [] })
    return (
      <section aria-labelledby="empty-home-care-title" data-testid="empty-home-care" data-tour-halt=""
        className="mx-auto w-full max-w-[560px] rounded-2xl border px-6 py-8 shadow-sm sm:px-8"
        style={{ background: SURFACE, borderColor: LINE }}>
        <h2 id="empty-home-care-title" className="text-center font-display text-2xl font-bold leading-tight sm:text-3xl" style={{ color: INK }}>
          Suggested for your home
        </h2>
        <p className="mt-2 text-center text-[0.9375rem] leading-relaxed" style={{ color: SUB }}>
          From what you told us. Add the ones you want.
        </p>
        {rows.length === 0 ? (
          <p className="mt-6 text-center text-[0.9375rem]" style={{ color: INK }}>Nothing new to suggest for these.</p>
        ) : (
          <ul className="mt-6 overflow-hidden rounded-2xl border" style={{ borderColor: LINE }}>
            {rows.map((r, i) => {
              const e = r.entry
              const isAdded = addedKeys.includes(e.key)
              const isBusy = busyKey === e.key
              const meta = [e.cadenceLabel, e.pro ? "Call a pro" : `${e.minutes} min`]
              return (
                <li key={e.key} data-testid="empty-home-row" className="px-4 py-3.5" style={{ borderTop: i ? `1px solid ${LINE}` : "none" }}>
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.9375rem] font-semibold leading-snug" style={{ color: INK }}>{e.title}</p>
                      {/* Each part stays whole: a narrow row wraps between "Twice a year" and "5 min", never inside one. */}
                      <p className="mt-0.5 text-[0.8125rem]" style={{ color: SUB }}>
                        {e.priorityTier === "essential" && (
                          <><span className="whitespace-nowrap font-semibold" style={{ color: "var(--hh-clay)" }}>Essential</span>{" · "}</>
                        )}
                        {meta.map((m, j) => (
                          <span key={m}>{j > 0 && " · "}<span className="whitespace-nowrap">{m}</span></span>
                        ))}
                      </p>
                      {e.key === "home.co_alarm_check" && (
                        <p className="mt-1 text-[0.8125rem] leading-snug" style={{ color: SUB }}>{e.why}</p>
                      )}
                    </div>
                    {isAdded ? (
                      <span className="inline-flex min-h-11 shrink-0 items-center gap-1 px-1 text-[0.9375rem] font-bold" style={{ color: TEAL }}>
                        <CheckIcon className="size-4" strokeWidth={3} aria-hidden />
                        Added
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void add(r)}
                        disabled={busyKey !== null}
                        aria-label={`Add ${e.title}`}
                        className="inline-flex min-h-11 min-w-[4.5rem] shrink-0 items-center justify-center gap-1.5 rounded-full border px-4 text-[0.9375rem] font-bold disabled:opacity-60"
                        style={OUTLINED}
                      >
                        {isBusy && <Loader2Icon className="size-4 animate-spin" aria-hidden />}
                        Add
                      </button>
                    )}
                  </div>
                  {rowErrors[e.key] && <InlineError className="mt-1.5">{rowErrors[e.key]}</InlineError>}
                </li>
              )
            })}
          </ul>
        )}
        {savedFacts && (
          <p className="mt-4 text-[0.875rem] leading-snug" style={{ color: SUB }}>
            Your answers are saved with your home. Change them anytime in Your Home.
          </p>
        )}
        <button type="button" onClick={done} disabled={busyKey !== null}
          className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-full px-5 text-base font-bold disabled:opacity-60" style={FILLED}>
          Done
        </button>
        <button type="button" onClick={() => setStage("pick")} disabled={busyKey !== null}
          className="hit-44 mt-3 min-h-11 text-[0.9375rem] font-semibold" style={{ color: TEAL }}>
          Edit what you have
        </button>
      </section>
    )
  }

  // ── Pick ──
  const canSee = ready && ticked.length > 0 && !savingFacts
  return (
    <section aria-labelledby="empty-home-title" data-testid="empty-home-card" data-tour-halt=""
      className="mx-auto w-full max-w-[560px] rounded-2xl border px-6 py-8 shadow-sm sm:px-8"
      style={{ background: SURFACE, borderColor: LINE }}>
      <h2 id="empty-home-title" className="text-center font-display text-2xl font-bold leading-tight sm:text-3xl" style={{ color: INK }}>
        What's in your home?
      </h2>
      <p className="mt-2 text-center text-[0.9375rem] leading-relaxed" style={{ color: SUB }}>
        Tap what you have. Homehub suggests the care that goes with it, and adds nothing until you say so.
      </p>

      {HOME_PICK_GROUPS.map((g) => {
        const hidden = g.picks.filter((p) => p.type === "appliance" && p.more && !ticked.includes(p.id))
        const shown = g.picks.filter((p) => showMore || !hidden.includes(p))
        return (
          <div key={g.title} role="group" aria-labelledby={`empty-home-group-${g.title}`} className="mt-5">
            <p id={`empty-home-group-${g.title}`} className="mb-2 text-xs font-bold uppercase tracking-[0.6px]" style={{ color: SUB }}>{g.title}</p>
            <div className="flex flex-wrap gap-2">
              {shown.map((p) => {
                const on = ticked.includes(p.id)
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={on}
                    disabled={!ready}
                    onClick={() => setTicked((t) => (on ? t.filter((x) => x !== p.id) : [...t, p.id]))}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-[0.9375rem] font-medium disabled:opacity-60"
                    style={on
                      ? { background: "var(--hh-teal-fill)", borderColor: "var(--hh-teal-fill)", color: "var(--hh-on-fill)" }
                      : { background: SURFACE, borderColor: LINE2, color: INK }}
                  >
                    {on && <CheckIcon className="size-4" strokeWidth={3} aria-hidden />}
                    {p.label}
                  </button>
                )
              })}
              {!showMore && hidden.length > 0 && (
                <button type="button" onClick={() => setShowMore(true)} disabled={!ready}
                  className="inline-flex min-h-11 items-center rounded-full border px-4 text-[0.9375rem] font-medium disabled:opacity-60"
                  style={{ background: SURFACE, borderColor: LINE2, color: INK }}>
                  More…
                </button>
              )}
            </div>
          </div>
        )
      })}

      {error && !data && (
        <InlineError className="mt-5" onRetry={() => void mutate()}>Couldn't load your home.</InlineError>
      )}
      {pickError && <InlineError className="mt-5">{pickError}</InlineError>}

      <button type="button" onClick={() => void seeCare()} disabled={!canSee}
        className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-5 text-base font-bold disabled:opacity-50" style={FILLED}>
        {savingFacts && <Loader2Icon className="size-4 animate-spin" aria-hidden />}
        See Suggested Care
      </button>
      <button type="button" onClick={() => navigate(exactModelsTarget([...created.values()], tickedKinds))} disabled={!ready}
        className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-full border px-5 text-base font-bold disabled:opacity-60" style={OUTLINED}>
        Add My Exact Models
      </button>
      <p className="mt-2 text-center text-[0.875rem] leading-snug" style={{ color: SUB }}>
        Brand and model, or the manual, gets you the maker's schedule.
      </p>
      <div className="mt-2 flex justify-center">
        <button type="button" onClick={collapse} disabled={!ready} className="hit-44 min-h-11 px-2 text-[0.9375rem] font-semibold disabled:opacity-60" style={{ color: SUB }}>
          Not now
        </button>
      </div>
    </section>
  )
}
