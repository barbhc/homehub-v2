import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { BellIcon, BellOffIcon, ChevronLeftIcon, Loader2Icon, SearchIcon } from "lucide-react"
import { PageContainer } from "@/components/layout"
import { useCurrentHome } from "@/modules/home"
import { useAuth } from "@/modules/auth"
import {
  proposeReminders, getTaskTemplates, setTaskReminder, setTaskCadence,
  type ProposedReminder,
} from "@/modules/care"
import { getItemUnits } from "@/modules/items"
import { isAgendaEligible } from "@/lib/agendaEligibility"
import { getNotificationPrefs, setNotificationPrefs } from "@/lib/userPreferences"
import { normalizeNotificationPrefs, type NotificationPrefs } from "@/lib/notificationPreferences"
import { cadenceLabel, cadenceLabelInline } from "../../shared/tasks/cadenceLabel"
import type { ScheduleType, TaskTemplate } from "@/integrations/types"

const INK = "var(--hh-ink)", SUB = "var(--hh-sub)", FAINT = "var(--hh-faint)", TEAL = "var(--hh-teal)", CLAY = "var(--hh-clay)"

/**
 * /reminders — "Your reminders": describe → propose → edit → turn on.
 *
 * Suggest, never assume, end to end: the proposal is drawn ONLY from tasks the
 * home already has (enforced server-side), every row starts ticked but is one
 * tap from unticked, cadence is editable in place, anything missed is a
 * search away — and NOTHING writes until "Turn these on". The only writes
 * this page ever performs are remindEnabled/cadence on the chosen rows and,
 * if the owner says yes at the end, the notification style. It cannot delete
 * or hide a task: the corpus stays on Tasks, item pages and search.
 */

/**
 * What the pick list may OFFER. Two rules, both about honesty:
 *
 * 1. Only tasks that recur. The parsed corpus is mostly tips and one-time
 *    setup steps ("Allow Motor to Cool After Overload", "Verify Clearance
 *    Around Unit"); on the owner's real home they buried the dozen tasks a
 *    reminder makes sense for. Curation never deletes them — they stay on the
 *    item page — they are just not reminders.
 * 2. Only tasks that would actually notify. The week and the push lanes read
 *    the agenda, which excludes item-scoped cleaning by the owner's rule; a
 *    task offered here that the lanes would never send is a broken promise.
 */
const RECURRING: ReadonlySet<string> = new Set(["weekly", "monthly", "quarterly", "semiannual", "annual", "seasonal", "every_n_days"])
export function offerable(t: Pick<TaskTemplate, "schedule" | "care_type" | "scope_type">): boolean {
  if (!t.schedule || !RECURRING.has(t.schedule.scheduleType)) return false
  return isAgendaEligible({ careType: t.care_type, scopeType: t.scope_type })
}

const CADENCE_OPTIONS: ScheduleType[] = ["weekly", "monthly", "quarterly", "semiannual", "annual", "seasonal", "as_needed"]

type Row = {
  id: string
  title: string
  itemName: string | null
  reason: string | null
  scheduleType: ScheduleType | null
  intervalDays: number | null
  originalSchedule: ScheduleType | null
  checked: boolean
  editing: boolean
  error: string | null
}

const fromProposal = (p: ProposedReminder): Row => ({
  id: p.task_template_id,
  title: p.title,
  itemName: p.item_name,
  reason: p.reason,
  scheduleType: p.suggested_schedule_type ?? p.current_schedule_type,
  intervalDays: p.suggested_interval_days ?? p.current_interval_days,
  originalSchedule: p.current_schedule_type,
  checked: true,
  editing: false,
  error: null,
})

/** One task in the pick list: what it is, and — when the group header doesn't
 *  already say so — which item it belongs to. */
function PickRow({ title, itemName, onAdd }: { title: string; itemName: string | null; onAdd: () => void }) {
  return (
    <div className="flex items-center gap-3 px-3.5 py-2.5">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium" style={{ color: INK }}>{title}</span>
        {itemName && <span className="block truncate text-[12px]" style={{ color: SUB }}>{itemName}</span>}
      </span>
      <button type="button" onClick={onAdd} aria-label={`Add ${title}`} className="shrink-0 text-[12.5px] font-bold" style={{ color: TEAL }}>Add</button>
    </div>
  )
}

const fromTemplate = (t: TaskTemplate, itemName: string | null): Row => ({
  id: t.task_template_id,
  title: t.title,
  itemName,
  reason: null,
  scheduleType: t.schedule?.scheduleType ?? null,
  intervalDays: t.schedule?.intervalDays ?? null,
  originalSchedule: t.schedule?.scheduleType ?? null,
  checked: true,
  editing: false,
  error: null,
})

type Stage = "describe" | "proposal" | "done"

export default function YourReminders() {
  const { home } = useCurrentHome()
  const homeId = home?.home_id ?? null
  const { user } = useAuth()
  const uid = user?.id ?? null

  const [stage, setStage] = useState<Stage>("describe")
  const [focus, setFocus] = useState("")
  const [proposing, setProposing] = useState(false)
  const [proposeError, setProposeError] = useState<string | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [templates, setTemplates] = useState<TaskTemplate[]>([])
  const [templatesError, setTemplatesError] = useState<string | null>(null)
  // item id → display name. A task title alone ("Replace the filter") says
  // nothing about WHICH filter; the owner hit exactly that on the pick list.
  const [itemNames, setItemNames] = useState<Map<string, string>>(new Map())
  const [search, setSearch] = useState("")
  const [applying, setApplying] = useState(false)
  const [turnedOn, setTurnedOn] = useState(0)
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null)
  const [modeSaved, setModeSaved] = useState<"curated" | "kept" | null>(null)
  const [modeError, setModeError] = useState<string | null>(null)

  // Templates power search (and the AI-free path). Loaded once; an error is
  // shown where search would be, never a silent empty list.
  useEffect(() => {
    if (!homeId) return
    let alive = true
    void Promise.all([getTaskTemplates(homeId), getItemUnits(homeId)]).then(([res, items]) => {
      if (!alive) return
      if (res.error || !res.data) setTemplatesError(res.error?.message ?? "Couldn't load your tasks")
      else setTemplates(res.data)
      // Names are context, not the list: if they fail, the tasks still show,
      // and the rows say "Whole home" rather than nothing. The task fetch
      // failing is the visible error above.
      if (items.data) setItemNames(new Map(items.data.map((i) => [i.item_unit_id, i.display_name])))
    })
    return () => { alive = false }
  }, [homeId])

  useEffect(() => {
    if (!uid) return
    void getNotificationPrefs(uid).then(setPrefs).catch(() => setPrefs(normalizeNotificationPrefs(undefined)))
  }, [uid])

  const propose = async () => {
    if (!homeId || !focus.trim()) return
    setProposing(true)
    setProposeError(null)
    try {
      const res = await proposeReminders({ homeId, focusText: focus.trim() })
      setRows(res.proposals.map(fromProposal))
      setStage("proposal")
    } catch (e) {
      setProposeError(e instanceof Error ? e.message : "Couldn't propose reminders right now")
    } finally {
      setProposing(false)
    }
  }

  const skipToPick = () => { setRows([]); setStage("proposal") }

  const inList = useMemo(() => new Set(rows.map((r) => r.id)), [rows])
  const itemNameOf = (t: TaskTemplate): string | null =>
    t.item_unit_id ? (itemNames.get(t.item_unit_id) ?? null) : null

  const searchHits = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return []
    return templates
      .filter((t) => offerable(t) && !inList.has(t.task_template_id))
      // "coway" should find the purifier's filter as surely as "filter" does.
      .filter((t) => t.title.toLowerCase().includes(q) || (itemNameOf(t) ?? "").toLowerCase().includes(q))
      .slice(0, 8)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, templates, inList, itemNames])

  // The pick list, with no search typed: every task not already on the list,
  // grouped under the item it belongs to. Landing on an empty search box and
  // being told to "pick from your tasks" was the gap the owner reported.
  const pickGroups = useMemo(() => {
    const groups = new Map<string, TaskTemplate[]>()
    for (const t of templates) {
      if (!offerable(t) || inList.has(t.task_template_id)) continue
      const key = itemNameOf(t) ?? "Whole home"
      groups.set(key, [...(groups.get(key) ?? []), t])
    }
    return [...groups.entries()]
      .sort((a, b) => (a[0] === "Whole home" ? 1 : b[0] === "Whole home" ? -1 : a[0].localeCompare(b[0])))
      .map(([name, list]) => [name, [...list].sort((a, b) => a.title.localeCompare(b.title))] as const)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates, inList, itemNames])

  const addTemplate = (t: TaskTemplate) => {
    setRows((rs) => [...rs, fromTemplate(t, itemNameOf(t))])
    setSearch("")
  }

  const patch = (id: string, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)))

  const chosen = rows.filter((r) => r.checked)

  const applyRow = async (r: Row): Promise<boolean> => {
    if (!homeId) return false
    const on = await setTaskReminder(homeId, r.id, true)
    if (on.error) { patch(r.id, { error: on.error.message }); return false }
    if (r.scheduleType && r.scheduleType !== r.originalSchedule) {
      const cad = await setTaskCadence(homeId, r.id, r.scheduleType, r.intervalDays)
      if (cad.error) { patch(r.id, { error: `Reminder is on, but the schedule didn't save: ${cad.error.message}` }); return false }
    }
    patch(r.id, { error: null })
    return true
  }

  const turnOn = async () => {
    if (chosen.length === 0) return
    setApplying(true)
    const results = await Promise.all(chosen.map(applyRow))
    setApplying(false)
    const ok = results.filter(Boolean).length
    setTurnedOn(ok)
    // Any failure keeps the list on screen with its error — a row that did
    // not save must not disappear into a success screen.
    if (ok === chosen.length) setStage("done")
  }

  const retryRow = async (r: Row) => {
    const ok = await applyRow(r)
    if (ok && rows.filter((x) => x.checked).every((x) => x.id === r.id || !x.error)) {
      setTurnedOn(rows.filter((x) => x.checked).length)
      setStage("done")
    }
  }

  const chooseMode = async (mode: "curated" | "kept") => {
    setModeError(null)
    if (mode === "kept" || !uid || !prefs) { setModeSaved(mode); return }
    try {
      await setNotificationPrefs(uid, { ...prefs, push_mode: "curated" })
      setModeSaved("curated")
    } catch (e) {
      setModeError(e instanceof Error ? e.message : "Couldn't save that")
    }
  }

  return (
    <PageContainer className="pb-28">
      <div className="mx-auto w-full max-w-[460px] lg:max-w-[560px]">
        <header className="flex flex-col gap-0.5 pt-2 pb-3">
          <Link to="/settings#reminders" className="inline-flex items-center gap-0.5 text-[13px] font-semibold" style={{ color: SUB }}>
            <ChevronLeftIcon className="size-[15px]" /> Settings
          </Link>
          <h1 className="mt-1.5 text-[19px] font-extrabold tracking-[-0.4px]" style={{ color: INK }}>Your reminders</h1>
          <p className="text-[12.5px]" style={{ color: SUB }}>
            {stage === "describe" && "Tell us what you want to stay on top of."}
            {stage === "proposal" && (rows.length ? `${rows.length} proposed · from what you told us` : "Pick from your tasks")}
            {stage === "done" && `${turnedOn} reminder${turnedOn === 1 ? "" : "s"} on`}
          </p>
        </header>

        {stage === "describe" && (
          <div className="flex flex-col gap-4">
            <div className="rounded-[14px] px-3.5 py-2.5 text-[13px] leading-snug" style={{ background: "var(--hh-teal-wash)", color: "var(--hh-teal-deep)" }}>
              We&apos;ll propose a shortlist from your items&apos; tasks. Nothing turns on until you approve it.
            </div>
            <textarea
              aria-label="What do you want to stay on top of?"
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              placeholder="The filters everywhere — furnace, purifiers, dishwasher. Smoke alarms and the dryer duct. Descaling the coffee machine…"
              className="min-h-[200px] w-full resize-y rounded-2xl border px-3.5 py-3 text-[15px] leading-relaxed outline-none focus:ring-2"
              style={{ borderColor: "var(--hh-line2)", background: "var(--hh-surface)", color: INK }}
            />
            {proposeError && (
              <div role="alert" className="rounded-2xl border px-4 py-3 text-[13px]" style={{ borderColor: CLAY, background: "var(--hh-clay-soft)", color: CLAY }}>
                <div className="font-semibold">Couldn&apos;t propose reminders</div>
                <div className="mt-0.5">{proposeError}</div>
              </div>
            )}
            <button
              type="button"
              onClick={() => void propose()}
              disabled={!focus.trim() || proposing}
              className="flex items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-bold text-white disabled:opacity-50"
              style={{ background: TEAL }}
            >
              {proposing && <Loader2Icon className="size-4 animate-spin" />}
              {proposing ? "Proposing…" : "Propose my reminders"}
            </button>
            <div className="text-center text-[12px]" style={{ color: FAINT }}>
              Takes a few seconds. You&apos;ll edit the list next. ·{" "}
              <button type="button" onClick={skipToPick} className="font-semibold" style={{ color: TEAL }}>Skip — pick from your tasks</button>
            </div>
          </div>
        )}

        {stage === "proposal" && (
          <div className="flex flex-col gap-4">
            {rows.length > 0 && (
              <div className="rounded-[14px] px-3.5 py-2.5 text-[13px] leading-snug" style={{ background: "var(--hh-teal-wash)", color: "var(--hh-teal-deep)" }}>
                Each of these will remind you — the weekly summary, plus a ping when it&apos;s due. Untick any, or change how often.
              </div>
            )}

            {rows.length > 0 && (
              <div className="overflow-hidden rounded-2xl border border-[var(--hh-line)] divide-y divide-[var(--hh-line)]" style={{ background: "var(--hh-surface)" }}>
                {rows.map((r) => (
                  <div key={r.id} className="px-3.5 py-3">
                    <label className="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        aria-label={r.title}
                        checked={r.checked}
                        onChange={(e) => patch(r.id, { checked: e.target.checked })}
                        className="mt-0.5 size-[18px] shrink-0 accent-[var(--hh-teal,#1B6B5A)]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14.5px] font-semibold tracking-[-0.2px]" style={{ color: r.checked ? INK : SUB }}>{r.title}</span>
                        <span className="mt-0.5 block text-[12.5px]" style={{ color: SUB }}>
                          {[r.itemName, r.scheduleType ? cadenceLabelInline(r.scheduleType, r.intervalDays) : "schedule not set"].filter(Boolean).join(" · ")}
                          {" · "}
                          <button type="button" onClick={(e) => { e.preventDefault(); patch(r.id, { editing: !r.editing }) }} className="font-semibold" style={{ color: TEAL }}>
                            {r.editing ? "Done" : "Change"}
                          </button>
                        </span>
                        {r.reason && <span className="mt-0.5 block text-[12px]" style={{ color: FAINT }}>{r.reason}</span>}
                      </span>
                      <span className="mt-0.5 shrink-0" style={{ color: r.checked ? TEAL : "#9AA29C" }}>
                        {r.checked ? <BellIcon className="size-4" /> : <BellOffIcon className="size-4" />}
                      </span>
                    </label>
                    {r.editing && (
                      <div className="mt-2 flex items-center gap-2 pl-[30px]">
                        <label className="text-[12.5px] font-semibold" style={{ color: SUB }}>How often?</label>
                        <select
                          aria-label={`How often for ${r.title}`}
                          value={r.scheduleType ?? ""}
                          onChange={(e) => patch(r.id, { scheduleType: (e.target.value || null) as ScheduleType | null, intervalDays: null })}
                          className="rounded-lg border px-2 py-1 text-[13px]"
                          style={{ borderColor: "var(--hh-line2)", background: "var(--hh-surface)", color: INK }}
                        >
                          {CADENCE_OPTIONS.map((c) => <option key={c} value={c}>{cadenceLabel(c)}</option>)}
                        </select>
                      </div>
                    )}
                    {r.error && (
                      <div role="alert" className="mt-2 flex items-center gap-2 pl-[30px] text-[12.5px]" style={{ color: CLAY }}>
                        <span>{r.error}</span>
                        <button type="button" onClick={() => void retryRow(r)} className="font-bold underline underline-offset-2">Retry</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5" style={{ background: "var(--hh-surface2)" }}>
                <SearchIcon className="size-4 shrink-0" style={{ color: FAINT }} />
                <input
                  type="search"
                  aria-label="Search your tasks"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={rows.length ? "Missed something? Search your tasks" : "Search your tasks"}
                  className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none"
                  style={{ color: INK }}
                />
              </div>
              {templatesError && <div role="alert" className="text-[12.5px]" style={{ color: CLAY }}>{templatesError}</div>}
              {searchHits.length > 0 && (
                <div className="overflow-hidden rounded-2xl border border-[var(--hh-line)] divide-y divide-[var(--hh-line)]" style={{ background: "var(--hh-surface)" }}>
                  {searchHits.map((t) => (
                    <PickRow key={t.task_template_id} title={t.title} itemName={itemNameOf(t) ?? "Whole home"} onAdd={() => addTemplate(t)} />
                  ))}
                </div>
              )}
              {search.trim() && searchHits.length === 0 && !templatesError && (
                <div className="text-[12.5px]" style={{ color: FAINT }}>No tasks match &ldquo;{search.trim()}&rdquo;.</div>
              )}
              {!search.trim() && pickGroups.length > 0 && (
                <div className="flex flex-col gap-3" data-testid="pick-list">
                  {pickGroups.map(([name, list]) => (
                    <section key={name} aria-label={name}>
                      <h3 className="mb-1.5 px-1 font-mono text-[10.5px] font-extrabold uppercase tracking-[0.12em]" style={{ color: FAINT }}>{name}</h3>
                      <div className="overflow-hidden rounded-2xl border border-[var(--hh-line)] divide-y divide-[var(--hh-line)]" style={{ background: "var(--hh-surface)" }}>
                        {list.map((t) => (
                          <PickRow key={t.task_template_id} title={t.title} itemName={null} onAdd={() => addTemplate(t)} />
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}
              {!search.trim() && pickGroups.length === 0 && templates.some(offerable) && rows.length > 0 && (
                <div className="text-[12.5px]" style={{ color: FAINT }}>Every task is on your list.</div>
              )}
            </div>

            <button
              type="button"
              onClick={() => void turnOn()}
              disabled={chosen.length === 0 || applying}
              className="flex items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-bold text-white disabled:opacity-50"
              style={{ background: TEAL }}
            >
              {applying && <Loader2Icon className="size-4 animate-spin" />}
              Turn these on · {chosen.length}
            </button>
            <div className="text-center text-[12px]" style={{ color: FAINT }}>Nothing else will notify you. Every task stays where it is.</div>
          </div>
        )}

        {stage === "done" && (
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl border border-[var(--hh-line)] px-4 py-4" style={{ background: "var(--hh-surface)" }}>
              <div className="text-[15px] font-semibold" style={{ color: INK }}>{turnedOn} reminder{turnedOn === 1 ? "" : "s"} on.</div>
              <div className="mt-1 text-[12.5px]" style={{ color: SUB }}>
                They&apos;ll show in your weekly summary and ping you when due. Change any of them on its task — the bell.
              </div>
              <Link to="/week" className="mt-3 inline-block text-[13px] font-semibold" style={{ color: TEAL }}>See your week</Link>
            </div>

            {prefs && prefs.push_mode !== "curated" && modeSaved == null && (
              <div className="rounded-2xl border border-[var(--hh-line)] px-4 py-4" style={{ background: "var(--hh-surface)" }}>
                <div className="text-[15px] font-semibold" style={{ color: INK }}>From now on, notify only this list?</div>
                <div className="mt-1 text-[12.5px]" style={{ color: SUB }}>
                  Right now Homehub also reminds you about anything Essential by default. &ldquo;Just my list&rdquo; turns that off — lapsed safety checks still get a mention in the weekly summary.
                </div>
                {modeError && <div role="alert" className="mt-2 text-[12.5px]" style={{ color: CLAY }}>{modeError}</div>}
                <div className="mt-3 flex items-center gap-3">
                  <button type="button" onClick={() => void chooseMode("curated")} className="rounded-full px-4 py-2 text-[13px] font-bold text-white" style={{ background: TEAL }}>Just my list</button>
                  <button type="button" onClick={() => void chooseMode("kept")} className="text-[13px] font-semibold" style={{ color: SUB }}>Keep my current style</button>
                </div>
              </div>
            )}
            {modeSaved === "curated" && (
              <div className="text-[12.5px]" style={{ color: SUB }}>Done — only your list notifies. Change it any time in Settings → Notifications.</div>
            )}
          </div>
        )}
      </div>
    </PageContainer>
  )
}
