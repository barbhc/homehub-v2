import { useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { CheckIcon, ChevronRightIcon, ExternalLinkIcon, ShoppingBagIcon } from "lucide-react"
import { addShoppingItem, type WeekReminder } from "@/modules/care"
import { useWeekReminders, isoDaysFromNow, weekChip } from "@/hooks/useWeekReminders"
import { buyFirstRows, type BuyFirstRow } from "@/lib/buyFirst"
import { TIER, type Tier } from "@/lib/redesign/tokens"

const INK = "var(--hh-ink)", SUB = "var(--hh-sub)", FAINT = "var(--hh-faint)", TEAL = "var(--hh-teal)", LINE = "var(--hh-line)"

/**
 * Home · "This week at home" — Option 2 from the round-19 canvas.
 *
 * EXPANDED on the page, not a tap-through card (the owner's call): this
 * week's reminders as a checklist you can complete in place, with the
 * "Buy first" strip at the end of the same card. Reads the same lens as
 * /week and the push lanes (useWeekReminders), so Home, the digest screen and
 * the phone never disagree about what's on the list.
 *
 * A failed load is a visible error with a retry. Rendering a calm "nothing
 * this week" over a failed fetch is precisely the silent fallback the error
 * standard forbids — it would look like success.
 */
export function ThisWeekSection({
  homeId,
  completingId,
  onComplete,
  excludeInstanceIds = [],
}: {
  homeId: string | null
  completingId: string | null
  /** Instances the hero above already lists. The same task twice on one
   *  screen is not "expanded", it is noise — this list shows the REST of the
   *  week, and says so when the hero already has all of it. */
  excludeInstanceIds?: string[]
  /** Completes a task INSTANCE in place — Home's own handler, so the optimistic
   *  update and error banner are the same ones the hero uses. */
  onComplete: (instanceId: string) => void
}) {
  const navigate = useNavigate()
  const { data, error, isLoading, mutate } = useWeekReminders(homeId, { days: 14 })
  const weekEnd = useMemo(() => isoDaysFromNow(7), [])
  const excluded = useMemo(() => new Set(excludeInstanceIds), [excludeInstanceIds])
  const wholeWeek = useMemo(() => (data?.all ?? []).filter((r) => r.dueDate <= weekEnd), [data, weekEnd])
  const thisWeek = useMemo(() => wholeWeek.filter((r) => !excluded.has(r.taskInstanceId)), [wholeWeek, excluded])
  const buyFirst = useMemo(() => buyFirstRows(data?.all ?? [], data?.shopping ?? []), [data])
  const [haveError, setHaveError] = useState<string | null>(null)

  const markHave = async (row: BuyFirstRow) => {
    if (!homeId) return
    setHaveError(null)
    const res = await addShoppingItem(homeId, {
      name: row.supply.name, supplyItemId: row.taskTemplateId, sourceTaskInstanceId: row.taskInstanceId, status: "have",
    })
    if (res.error || !res.data) { setHaveError(res.error?.message ?? "Couldn't save that"); return }
    await mutate()
  }

  if (!homeId) return null

  return (
    <section className="flex flex-col gap-2.5" data-testid="this-week">
      <div className="flex items-baseline justify-between pl-0.5">
        <span className="text-xs font-bold uppercase tracking-[0.6px]" style={{ color: SUB }}>This week at home</span>
        <Link to="/week" className="whitespace-nowrap pl-2.5 text-[12.5px] font-semibold" style={{ color: TEAL }}>
          {wholeWeek.length > 0 ? `${wholeWeek.length} this week` : "See all"}
        </Link>
      </div>

      {error && !data && (
        <div role="alert" className="rounded-2xl border px-4 py-3" style={{ borderColor: "var(--hh-clay)", background: "var(--hh-clay-soft)" }}>
          <div className="text-[13.5px] font-semibold" style={{ color: "var(--hh-clay)" }}>Couldn&apos;t load this week</div>
          <div className="mt-0.5 text-[12.5px]" style={{ color: "var(--hh-clay)" }}>{error.message}</div>
          <button type="button" onClick={() => void mutate()} className="mt-2 text-[12.5px] font-bold underline underline-offset-2" style={{ color: "var(--hh-clay)" }}>Try again</button>
        </div>
      )}

      {isLoading && !data && !error && <div className="px-1 text-[13px]" style={{ color: FAINT }}>Loading…</div>}

      {data && (
        <div className="overflow-hidden rounded-2xl border shadow-[0_1px_2px_rgba(15,23,42,0.04)]" style={{ background: "var(--hh-surface)", borderColor: LINE }}>
          {thisWeek.length === 0 ? (
            <div className="px-4 py-4">
              {wholeWeek.length > 0 ? (
                <div className="text-[13.5px]" style={{ color: SUB }}>Everything for this week is up top.</div>
              ) : (
                <>
                  <div className="text-[14.5px] font-semibold" style={{ color: INK }}>Nothing needs you this week.</div>
                  <div className="mt-0.5 text-[12.5px]" style={{ color: SUB }}>
                    Reminders you turn on show up here.{" "}
                    <Link to="/reminders" className="font-semibold" style={{ color: TEAL }}>Your reminders</Link>
                  </div>
                </>
              )}
            </div>
          ) : (
            thisWeek.map((t, i) => (
              <WeekRow
                key={t.taskInstanceId}
                t={t}
                first={i === 0}
                completing={completingId === t.taskInstanceId}
                onComplete={() => onComplete(t.taskInstanceId)}
                onOpen={() => navigate(`/tasks/${t.taskInstanceId}`)}
              />
            ))
          )}

          {buyFirst.map((row) => (
            <div key={`${row.taskInstanceId}:${row.supplyIndex}`} className="flex items-center gap-3 px-3.5 py-3" style={{ background: "var(--hh-gold-soft)", borderTop: `1px solid ${LINE}` }}>
              <ShoppingBagIcon className="size-[17px] shrink-0" style={{ color: "var(--hh-gold)" }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold" style={{ color: INK }}>Buy first: {row.supply.name}{row.supply.size ? ` · ${row.supply.size}` : ""}</span>
                <span className="block truncate text-[11.5px]" style={{ color: SUB }}>
                  {row.supply.url ? `Your link: ${domainOf(row.supply.url)}` : `${row.taskTitle} · no link saved yet`}
                </span>
              </span>
              {row.supply.url && (
                <a href={row.supply.url} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold" style={{ color: TEAL }}>
                  Buy <ExternalLinkIcon className="size-3" />
                </a>
              )}
              <button type="button" onClick={() => void markHave(row)} className="shrink-0 text-[12.5px] font-semibold" style={{ color: SUB }} aria-label={`I have one — ${row.supply.name}`}>
                Have one
              </button>
            </div>
          ))}
          {haveError && <div role="alert" className="px-4 py-2 text-[12.5px]" style={{ color: "var(--hh-clay)" }}>{haveError}</div>}
        </div>
      )}
    </section>
  )
}

function domainOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, "") } catch { return url }
}

function asTier(t: string): Tier {
  return t === "essential" || t === "optional" ? t : "recommended"
}

function WeekRow({ t, first, completing, onComplete, onOpen }: {
  t: WeekReminder; first: boolean; completing: boolean; onComplete: () => void; onOpen: () => void
}) {
  const tier = asTier(t.priorityTier)
  const meta = [t.itemName, t.estimatedMinutes != null ? `${t.estimatedMinutes} min` : null].filter(Boolean).join(" · ")
  return (
    <div className="flex items-center gap-2.5 px-3.5 py-3" style={first ? undefined : { borderTop: `1px solid ${LINE}` }}>
      <button type="button" disabled={completing} onClick={onComplete} aria-label={`Mark "${t.title}" done`} className="-ml-1 flex shrink-0 p-1.5 disabled:opacity-40">
        <span className="flex size-6 items-center justify-center rounded-full border-2" style={{ borderColor: TEAL }}>
          <CheckIcon className="size-3 opacity-0" strokeWidth={3} />
        </span>
      </button>
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
        <span className="min-w-0 flex-1">
          {/* "Reminder:" is read to screen readers and kept out of sight — it
              says what kind of row this is, and keeps the visible title from
              being an exact duplicate of the hero's row above. */}
          <span className="block text-[14.5px] font-semibold leading-snug tracking-[-0.2px] text-pretty" style={{ color: INK }}>
            <span className="sr-only">Reminder: </span>{t.title}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full px-2 py-0.5 text-[10.5px] font-bold" style={{ background: TIER[tier].soft, color: TIER[tier].dot }}>{TIER[tier].label}</span>
            {meta && <span className="text-[12.5px]" style={{ color: SUB }}>{meta}</span>}
          </span>
        </span>
        <span className="shrink-0 text-[12.5px] font-semibold" style={{ color: FAINT }}>{weekChip(t)}</span>
        <ChevronRightIcon className="size-4 shrink-0" style={{ color: "#C2CBD4" }} />
      </button>
    </div>
  )
}
