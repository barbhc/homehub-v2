/**
 * Your home — the one page for what Homehub knows about the house
 * (design/settings-your-home.md, audit finding 10, owner-approved 2026-11-21).
 *
 * It used to be five places: Home profile and "Your home" in Settings, House
 * notes under Items, and House rules. Now: the basics, what the house has (the
 * yes/no questions behind whole-home care, design/care-library.md), the
 * shutoffs, the notes and the rules. Each row opens the editor that already
 * existed; nothing is created until she says so.
 */
import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom"
import { ChevronLeftIcon, HomeIcon, KeyRoundIcon, ListChecksIcon, Loader2Icon, MapPinIcon, NotebookTextIcon, StickyNoteIcon } from "lucide-react"
import { PageContainer } from "@/components/layout"
import { ListCard, ListRow, ListSection } from "@/components/layout/RowList"
import { HomeProfileSection } from "@/components/settings/HomeProfileSection"
import { HouseRulesSection } from "@/components/settings/HouseRulesSection"
import { useNotes } from "@/components/notes/useNotes"
import { pinchSpots } from "@/lib/homeSections"
import { areaLine, basicsRows, houseNoteCount, roomNotesLine, PINCH_ICON, yourHomePart } from "@/lib/yourHome"
import { useCurrentHome, getHomeProfile, upsertHomeProfile, getRooms, type HomeProfile } from "@/modules/home"
import { getTaskTemplates, addLibraryTask, dismissLibrarySuggestion, getHomeNotes, listHouseRules } from "@/modules/care"
import { SuggestedRow } from "@/components/care/SuggestedRow"
import { suggestionsForHome, type CareFacts, type Suggestion } from "../../shared/care/library"
import type { TaskTemplate } from "@/integrations/types"
import { CATEGORIES, categoryStatus, type Category, type FactKey } from "./homeSetupCategories"
import { useDepsChanged } from "@/hooks/useDepsChanged"
import { useIsCurrent } from "@/hooks/useIsCurrent"

const INK = "var(--hh-ink)", SUB = "var(--hh-sub)", FAINT = "var(--hh-faint)", TEAL = "var(--hh-teal)", CLAY = "var(--hh-clay)"
const SURFACE = "var(--hh-surface)", LINE = "var(--hh-line)"

export default function YourHome() {
  const { home } = useCurrentHome()
  const homeId = home?.home_id ?? null

  // Which editor is open rides in the URL (?part=basics, ?part=pests), so Back
  // closes it and Settings or Home can link straight to one.
  const [params, setParams] = useSearchParams()
  const open = params.get("part")
  const location = useLocation()
  const navigate = useNavigate()
  const setOpen = (part: string) => setParams((p) => {
    const n = new URLSearchParams(p)
    n.set("part", part)
    return n
  }, { state: { inPage: true } })

  // Opened from this page: Back is the way out, so closing goes back. Arrived
  // by a link straight to an editor: there is no hub behind it, so replace.
  const closePart = () => {
    if (location.state && (location.state as { inPage?: boolean }).inPage) navigate(-1)
    else setParams((p) => { const n = new URLSearchParams(p); n.delete("part"); return n }, { replace: true })
  }

  const basicsOpen = open === "basics"
  const [profile, setProfile] = useState<HomeProfile | null>(null)
  const [facts, setFacts] = useState<CareFacts>({})
  const [dismissed, setDismissed] = useState<string[]>([])
  const [homeTasks, setHomeTasks] = useState<TaskTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  // Two ways to read the home again. A RELOAD replaces the page with the
  // spinner: the first read, a home switch, Try again, and a library Add (the
  // added row leaves with it) — set in the render or handler that asks, so the
  // effect below only reads. A REFRESH reads behind the page: her own task's
  // Add. The reload used to be the only way, so the spinner replaced the page
  // — CustomTask with it — and its "Added … to your Tasks." was drawn for a
  // single frame.
  if (useDepsChanged([homeId])) {
    setLoading(true)
    setLoadError(null)
    // A switch starts the page over for the new home: nothing of the last
    // home's is kept, to show or to seed an edit with — and an open category
    // closes (its answers were the last home's).
    setProfile(null)
    setFacts({})
    setDismissed([])
    setHomeTasks([])
  }
  // Every write here goes to the home it was STARTED for — bound when the edit
  // began (the open questions, the row tapped, the form), never read from the
  // home on screen when the write runs — and its answer lands only while that
  // home is still on screen (switch safety). Home A's answers, saved as the
  // person switched to home B, used to land in B's state: B showed A's
  // answers, and B's next Save — its draft seeded from them — wrote A's
  // answers into B's profile.
  const isCurrentHome = useIsCurrent(homeId)
  const reload = () => {
    setLoading(true)
    setLoadError(null)
    setReloadKey((k) => k + 1)
  }

  useEffect(() => {
    if (!homeId) return
    let alive = true
    Promise.all([getHomeProfile(homeId), getTaskTemplates(homeId)]).then(([profile, templates]) => {
      if (!alive) return
      // A failed read must never look like "nothing set up" — the page says so and offers a retry.
      if (profile.error) { setLoadError(profile.error.message); setLoading(false); return }
      if (templates.error) { setLoadError(templates.error.message); setLoading(false); return }
      setLoadError(null)
      setProfile(profile.data ?? null)
      setFacts(profile.data?.care_facts ?? {})
      setDismissed(profile.data?.dismissed_care ?? [])
      setHomeTasks((templates.data ?? []).filter((t) => t.scope_type === "home" && t.is_active && !t.deleted_at))
      setLoading(false)
    }).catch((e: unknown) => {
      // A thrown rejection (not a ServiceResult error) must not strand the spinner.
      if (!alive) return
      setLoadError(e instanceof Error ? e.message : String(e))
      setLoading(false)
    })
    return () => { alive = false }
    // `basicsOpen`: the basics editor saves on its own, so closing it reads
    // again behind the page and the rows show what was just saved.
  }, [homeId, reloadKey, basicsOpen])

  const suggestions = useMemo(
    () => suggestionsForHome(facts, homeTasks.map((t) => ({ title: t.title, scheduleType: t.schedule?.scheduleType ?? null })), dismissed),
    [facts, homeTasks, dismissed],
  )

  /** A write for `forHome` answered after the person switched away: it
   *  landed (or not) on that home, and this page says nothing about it — a
   *  failure is logged, since shown here it would read as this home's. */
  const leftHome = (forHome: string, what: string, error: { message: string } | null) => {
    if (isCurrentHome(forHome)) return false
    if (error) console.warn(`[home-setup] could not ${what} for home ${forHome}, answered after a switch:`, error.message)
    return true
  }

  /** `forHome`: the home the questions were opened on (CategoryQuestions'). */
  const saveFacts = async (forHome: string, next: CareFacts) => {
    const res = await upsertHomeProfile(forHome, { care_facts: next })
    if (leftHome(forHome, "save answers", res.error)) return { error: res.error }
    if (res.error) return { error: res.error }
    setFacts(next)
    return { error: null }
  }

  /** `forHome`: the home on screen when the row (or Add all) was tapped. */
  const add = async (forHome: string | null, s: Suggestion) => {
    if (!forHome) return { error: { message: "No home selected" } }
    const res = await addLibraryTask(forHome, null, s.entry)
    if (leftHome(forHome, `add ${s.entry.key}`, res.error)) return { error: res.error }
    if (res.error) return { error: res.error }
    reload()
    return { error: null }
  }
  const dismiss = async (forHome: string | null, s: Suggestion) => {
    if (!forHome) return { error: { message: "No home selected" } }
    const res = await dismissLibrarySuggestion(forHome, null, s.entry.key)
    if (leftHome(forHome, `dismiss ${s.entry.key}`, res.error)) return { error: res.error }
    if (res.error) return { error: res.error }
    setDismissed((d) => [...d, s.entry.key])
    return { error: null }
  }

  // A home switch closes whatever editor was open: its answers were the last home's.
  const lastHome = useRef(homeId)
  useEffect(() => {
    if (lastHome.current === homeId) return
    lastHome.current = homeId
    setParams((p) => { const n = new URLSearchParams(p); n.delete("part"); return n }, { replace: true })
  }, [homeId, setParams])

  const category = CATEGORIES.find((c) => c.key === open) ?? null
  const part: "basics" | "rules" | null = open === "basics" || open === "rules" ? open : null
  const editing = !!category || !!part
  const heading = category ? category.label : part === "basics" ? "The basics" : part === "rules" ? "House rules" : "Your home"
  const sub = category
    ? "Answer what you know. Skip what you don't."
    : part === "basics"
      ? "Home type, whether you own it, and the zip. They decide which tasks you're offered."
      : part === "rules"
        ? "What Homehub learned when you tuned a task. Deleting a rule stops it for future tasks. It won't bring back tasks you already hid."
        : "What Homehub knows about the house. It shapes the tasks you're offered."
  const basics = basicsRows(profile)

  return (
    <PageContainer>
      <div className="mx-auto w-full max-w-[640px] pb-10" data-testid="your-home">
        <div className="mb-2 flex items-center gap-2">
          {editing ? (
            <button type="button" onClick={closePart} className="flex min-h-11 items-center gap-1 text-[0.9375rem] font-semibold" style={{ color: TEAL }}>
              <ChevronLeftIcon className="size-4" aria-hidden /> Your home
            </button>
          ) : (
            <Link to="/settings" className="flex min-h-11 items-center gap-1 text-[0.9375rem] font-semibold" style={{ color: TEAL }}>
              <ChevronLeftIcon className="size-4" aria-hidden /> Settings
            </Link>
          )}
        </div>

        <h1 className="text-[1.75rem] font-extrabold leading-[1.2] tracking-[-0.5px]" style={{ color: INK }}>{heading}</h1>
        <p className="mt-1 text-[0.9375rem] leading-[1.4]" style={{ color: SUB }}>{sub}</p>

        {part === "basics" && homeId ? (
          // Reads and saves on its own; this page reads again when it closes.
          <div className="mt-5"><HomeProfileSection homeId={homeId} /></div>
        ) : part === "rules" && homeId ? (
          <div className="mt-5"><HouseRulesSection homeId={homeId} /></div>
        ) : loading ? (
          <div className="mt-8 flex items-center gap-2 text-[0.875rem]" style={{ color: SUB }}><Loader2Icon className="size-4 animate-spin" /> Loading your answers…</div>
        ) : loadError ? (
          <div role="alert" className="mt-6 rounded-2xl px-4 py-3 text-[0.875rem]" style={{ background: SURFACE, border: `1px solid ${LINE}`, color: CLAY }}>
            Couldn&apos;t load your home: {loadError}{" "}
            <button type="button" onClick={reload} className="hit-44 font-bold" style={{ color: TEAL }}>Try again</button>
          </div>
        ) : category && homeId ? (
          <CategoryQuestions key={homeId} homeId={homeId} category={category} facts={facts} onSave={saveFacts} onDone={closePart} />
        ) : (
          <div className="mt-6 flex flex-col gap-7">
            <ListSection label="The basics" testId="home-basics" note={areaLine(profile)}>
              <ListCard>
                {basics.map((r, i) => (
                  <ListRow key={r.key} first={i === 0} icon={BASICS_ICON[r.key]} title={r.title} value={r.value} onClick={() => setOpen("basics")} testId="basics-row" />
                ))}
              </ListCard>
            </ListSection>

            <ListSection label="What it has" testId="home-has">
              <ListCard testId="setup-categories">
                {CATEGORIES.map((c, i) => {
                  const status = categoryStatus(c, facts)
                  return <ListRow key={c.key} first={i === 0} title={c.label} sub={c.blurb} value={status} onClick={() => setOpen(c.key)} />
                })}
              </ListCard>
            </ListSection>

            {/* Shown once an answer could have unlocked something: with no
                answers there is nothing to suggest and nothing to explain. */}
            {(suggestions.length > 0 || Object.keys(facts).length > 0) && (
              <section data-testid="home-suggestions">
                <div className="mb-2 flex items-center gap-1.5 pl-0.5">
                  <span className="text-xs font-bold uppercase leading-[1.33] tracking-[0.6px]" style={{ color: SUB }}>Suggested for your home</span>
                  <span className="text-xs font-bold" style={{ color: FAINT }}>{suggestions.length}</span>
                  <div className="flex-1" />
                  {suggestions.length > 1 && <AddAll suggestions={suggestions} onAdd={(s) => add(homeId, s)} />}
                </div>
                <div className="overflow-hidden rounded-2xl" style={{ background: SURFACE, border: `1px solid ${LINE}` }}>
                  {suggestions.length === 0 ? (
                    <p className="px-4 py-4 text-[0.875rem]" style={{ color: SUB }}>
                      Everything your answers call for is already on your list.
                    </p>
                  ) : suggestions.map((s, i) => (
                    <SuggestedRow key={s.entry.key} suggestion={s} itemName="Whole home" onAdd={() => add(homeId, s)} onDismiss={() => dismiss(homeId, s)} last={i === suggestions.length - 1} />
                  ))}
                </div>
              </section>
            )}

            {homeId && <NotesAndRules key={homeId} homeId={homeId} />}
          </div>
        )}
      </div>
    </PageContainer>
  )
}

const BASICS_ICON = { type: HomeIcon, ownership: KeyRoundIcon, zip: MapPinIcon } as const

/**
 * In a pinch, Notes and Rules: three small reads of their own (house notes,
 * rooms, rules). A read that fails says so in its section and offers Try
 * again; it never shows "Add" or "None yet" over data it couldn't read.
 */
function NotesAndRules({ homeId }: { homeId: string }) {
  const { notes, error: notesError, reload: reloadNotes } = useNotes(`home-notes:${homeId}`, () => getHomeNotes(homeId))
  const [rooms, setRooms] = useState<{ room_id: string; name: string }[] | null>(null)
  const [rules, setRules] = useState<{ count: number } | { error: string } | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    void getRooms(homeId).then((res) => {
      if (!alive) return
      // Room names only label the "By room" line; without them it shows no
      // names, and the row still opens the notes. Logged, not shown.
      if (res.error) { console.warn(`[your-home] could not load rooms for home ${homeId}:`, res.error.message); setRooms([]); return }
      setRooms(res.data ?? [])
    })
    void listHouseRules(homeId).then((res) => {
      if (!alive) return
      setRules(res.error ? { error: res.error.message } : { count: res.data?.length ?? 0 })
    })
    return () => { alive = false }
  }, [homeId, attempt])

  const failed = (retry: () => void) => (
    <div role="alert" className="flex items-center gap-2 px-4 py-3.5 text-[0.9375rem]" style={{ color: CLAY }}>
      <span className="min-w-0 flex-1">Couldn&apos;t load these.</span>
      <button type="button" onClick={retry} className="hit-44 shrink-0 font-bold underline underline-offset-2">Try again</button>
    </div>
  )
  const houseCount = notes ? houseNoteCount(notes) : 0
  const byRoom = notes && rooms ? roomNotesLine(notes, rooms) : null

  return (
    <>
      <ListSection label="In a pinch" testId="home-pinch">
        <ListCard>
          {notesError ? failed(reloadNotes) : !notes ? <Quiet /> : pinchSpots(notes).map((s, i) => (
            <ListRow
              key={s.key}
              first={i === 0}
              icon={PINCH_ICON[s.key]}
              title={s.label}
              sub={s.value ?? "Not noted yet"}
              action={s.value ? undefined : "Add"}
              to={s.value ? "/inventory/notes" : `/inventory/notes?idea=${encodeURIComponent(s.idea)}`}
              testId="home-pinch-row"
            />
          ))}
        </ListCard>
      </ListSection>

      <ListSection label="Notes" testId="home-notes">
        <ListCard>
          {notesError ? failed(reloadNotes) : !notes ? <Quiet /> : (
            <>
              <ListRow first icon={NotebookTextIcon} tone="grey" title="House notes" sub={houseCount > 0 ? `${houseCount} saved` : "Paint colors, Wi-Fi, filter sizes"} to="/inventory/notes" />
              <ListRow first={false} icon={StickyNoteIcon} tone="grey" title="By room" sub={byRoom ?? "Notes that belong to one room"} to="/inventory/notes#notes-by-room" />
            </>
          )}
        </ListCard>
      </ListSection>

      <ListSection label="Rules" testId="home-rules">
        <ListCard>
          {rules && "error" in rules ? failed(() => { setRules(null); setAttempt((n) => n + 1) }) : !rules ? <Quiet /> : (
            <ListRow
              first
              icon={ListChecksIcon}
              title="House rules"
              sub={rules.count > 0 ? `${rules.count} in use` : "None yet. They come from tuning tasks."}
              to={yourHomePart("rules")}
              testId="home-rules-row"
            />
          )}
        </ListCard>
      </ListSection>
    </>
  )
}

/** A section still reading: its space, and a word for screen readers. */
function Quiet() {
  return <div className="flex min-h-[60px] items-center px-4 text-[0.875rem]" style={{ color: FAINT }} role="status">Loading…</div>
}

/** Yes / No / (the building does it) per question; Save writes the facts and surfaces any failure in place. */
function CategoryQuestions({ homeId, category, facts, onSave, onDone }: {
  /** The home these answers are for. The draft starts from ITS facts, so a
   *  save goes to it — the page keys this by home, so it never changes. */
  homeId: string
  category: Category
  facts: CareFacts
  onSave: (forHome: string, next: CareFacts) => Promise<{ error: { message: string } | null }>
  onDone: () => void
}) {
  const [draft, setDraft] = useState<CareFacts>(facts)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const building = category.building ? !!draft[category.building] : false
  const isShown = useIsCurrent(homeId)

  const set = (fact: FactKey, value: boolean | undefined) =>
    setDraft((d) => { const n = { ...d }; if (value === undefined) delete n[fact]; else n[fact] = value; return n })

  const save = async () => {
    setSaving(true); setError(null)
    const res = await onSave(homeId, draft)
    // The page switched homes while this saved: these questions are gone, and
    // nothing of the save — its error, its "done" — is the new home's.
    if (!isShown(homeId)) return
    setSaving(false)
    if (res.error) { setError(res.error.message); return }
    onDone()
  }

  return (
    <div className="mt-5">
      {category.building && (
        <label className="mb-4 flex items-center gap-3 rounded-2xl px-4 py-3" style={{ background: SURFACE, border: `1px solid ${LINE}` }}>
          <input type="checkbox" checked={building} onChange={(e) => set(category.building!, e.target.checked || undefined)} className="size-4" />
          <span className="text-[0.875rem]" style={{ color: INK }}>The building or an HOA handles this for me</span>
        </label>
      )}
      <div className="overflow-hidden rounded-2xl" style={{ background: SURFACE, border: `1px solid ${LINE}`, opacity: building ? 0.55 : 1 }} data-testid="setup-questions">
        {category.questions.map((q, i) => (
          <div key={q.fact} className="px-4 py-3" style={{ borderTop: i === 0 ? "none" : `1px solid ${LINE}` }}>
            <p className="text-[0.90625rem] font-medium" style={{ color: INK }}>{q.text}</p>
            <div className="mt-2 flex gap-2" role="radiogroup" aria-label={q.text}>
              {([["Yes", true], ["No", false], ["Not sure", undefined]] as const).map(([label, value]) => {
                const on = draft[q.fact] === value
                return (
                  <button
                    key={label}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={building}
                    onClick={() => set(q.fact, value)}
                    className="hit-44 min-h-9 rounded-full px-3.5 text-[0.8125rem] font-semibold"
                    style={{ background: on ? "var(--hh-teal-wash)" : "transparent", color: on ? TEAL : SUB, border: `1px solid ${on ? TEAL : LINE}` }}
                  >{label}</button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      {error && <div role="alert" className="mt-3 text-[0.8125rem] font-medium" style={{ color: CLAY }}>Couldn&apos;t save: {error}</div>}
      <button type="button" onClick={() => void save()} disabled={saving} className="mt-4 min-h-11 w-full rounded-2xl text-[0.9375rem] font-bold text-white" style={{ background: "var(--hh-teal-fill)", opacity: saving ? 0.7 : 1 }}>
        {saving ? "Saving…" : "Save answers"}
      </button>
    </div>
  )
}

/** Adds every suggestion in order; stops at the first failure and says which one. */
function AddAll({ suggestions, onAdd }: { suggestions: Suggestion[]; onAdd: (s: Suggestion) => Promise<{ error: { message: string } | null }> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async () => {
    setBusy(true); setError(null)
    for (const s of suggestions) {
      const res = await onAdd(s)
      if (res.error) { setError(`${s.entry.title}: ${res.error.message}`); break }
    }
    setBusy(false)
  }
  return (
    <span className="flex items-center gap-2">
      {error && <span role="alert" className="text-[0.75rem]" style={{ color: CLAY }}>{error}</span>}
      <button type="button" onClick={() => void run()} disabled={busy} className="hit-44 min-h-9 text-[0.8125rem] font-bold" style={{ color: TEAL }}>{busy ? "Adding…" : "Add all"}</button>
    </span>
  )
}
