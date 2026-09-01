import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import useSWR from "swr"
import { BellIcon, CheckIcon, ChevronLeftIcon, ExternalLinkIcon, ShoppingBagIcon } from "lucide-react"
import { PageContainer } from "@/components/layout"
import { useCurrentHome } from "@/modules/home"
import { getWeekReminders, listShoppingItems, addShoppingItem, type WeekReminder } from "@/modules/care"
import { usePushMode } from "@/hooks/usePushMode"
import { buyFirstRows, type BuyFirstRow } from "@/lib/buyFirst"
import { TIER, type Tier, shortDate } from "@/lib/redesign/tokens"
import type { ShoppingListItem } from "@/integrations/types"

const INK = "var(--hh-ink)", SUB = "var(--hh-sub)", FAINT = "var(--hh-faint)", TEAL = "var(--hh-teal)"
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

/**
 * /week — "Your week": the Sunday summary's in-app destination.
 *
 * Reads the week through the notification lens (getWeekReminders + the
 * user's push mode) so the rows here are EXACTLY what the digest push names.
 * Built before the push points at it, so the URL has somewhere to land from
 * day one. Copy per the approved round-19 canvas ("Your week (digest)").
 */

type WeekData = { all: WeekReminder[]; hiddenCount: number; shopping: ShoppingListItem[] }

function isoDaysFromNow(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}
function dayChip(dueDate: string, withinWeek: boolean): string {
  const d = new Date(`${dueDate}T00:00:00`)
  if (Number.isNaN(d.getTime())) return ""
  return withinWeek
    ? d.toLocaleDateString("en-US", { weekday: "short" })
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}
function hourLabel(hour: number): string {
  const h = hour % 12 === 0 ? 12 : hour % 12
  return `${h} ${hour < 12 ? "AM" : "PM"}`
}
function asTier(t: string): Tier {
  return t === "essential" || t === "optional" ? t : "recommended"
}

export default function YourWeek() {
  const { home } = useCurrentHome()
  const homeId = home?.home_id ?? null
  const { mode, prefs } = usePushMode()

  const { data, error, isLoading, mutate } = useSWR<WeekData>(
    homeId ? `week:reminders:${homeId}:${mode}` : null,
    async () => {
      // Both must succeed: a week that quietly dropped its supplies would show
      // a false "nothing to buy". Errors throw into SWR's error path.
      const [week, shopping] = await Promise.all([
        getWeekReminders(homeId!, mode, { days: 30 }),
        listShoppingItems(homeId!, { includeBought: true }),
      ])
      if (week.error || !week.data) throw new Error(week.error?.message ?? "Could not load your week")
      if (shopping.error || !shopping.data) throw new Error(shopping.error?.message ?? "Could not load your shopping list")
      return { all: week.data.items, hiddenCount: week.data.hiddenCount, shopping: shopping.data }
    },
    { revalidateOnFocus: false }
  )

  const weekEnd = useMemo(() => isoDaysFromNow(7), [])
  const thisWeek = useMemo(() => (data?.all ?? []).filter((r) => r.dueDate <= weekEnd), [data, weekEnd])
  const later = useMemo(() => (data?.all ?? []).filter((r) => r.dueDate > weekEnd).slice(0, 4), [data, weekEnd])
  const buyFirst = useMemo(() => buyFirstRows(thisWeek, data?.shopping ?? []), [thisWeek, data])

  const [haveError, setHaveError] = useState<string | null>(null)
  const markHave = async (row: BuyFirstRow) => {
    if (!homeId) return
    setHaveError(null)
    const res = await addShoppingItem(homeId, {
      name: row.supply.name,
      supplyItemId: row.taskTemplateId,
      sourceTaskInstanceId: row.taskInstanceId,
      status: "have",
    })
    if (res.error || !res.data) {
      setHaveError(res.error?.message ?? "Couldn't save that")
      return
    }
    await mutate()
  }

  const digest = prefs.weekly_digest

  return (
    <PageContainer className="pb-28">
      <div className="lg:hidden -mx-6">
        <div className="mx-auto w-full max-w-[460px] px-4">
          <header className="flex flex-col gap-0.5 pt-2 pb-3">
            <Link to="/home" className="inline-flex items-center gap-0.5 text-[13px] font-semibold" style={{ color: SUB }}>
              <ChevronLeftIcon className="size-[15px]" /> Home
            </Link>
            <h1 className="mt-1.5 text-[19px] font-extrabold tracking-[-0.4px]" style={{ color: INK }}>Your week</h1>
            <p className="text-[12.5px]" style={{ color: SUB }}>
              {shortDate(0)} – {shortDate(7)} · from your reminders
            </p>
          </header>

          {isLoading && !data && (
            <div className="py-6 text-[13px]" style={{ color: FAINT }}>Loading…</div>
          )}

          {error && !data && (
            <div role="alert" className="rounded-2xl border px-4 py-3" style={{ borderColor: "var(--hh-clay)", background: "var(--hh-clay-soft)" }}>
              <div className="text-[13.5px] font-semibold" style={{ color: "var(--hh-clay)" }}>Couldn&apos;t load your week</div>
              <div className="mt-0.5 text-[12.5px]" style={{ color: "var(--hh-clay)" }}>{error.message}</div>
              <button type="button" onClick={() => void mutate()} className="mt-2 text-[12.5px] font-bold underline underline-offset-2" style={{ color: "var(--hh-clay)" }}>
                Try again
              </button>
            </div>
          )}

          {data && (
            <div className="flex flex-col gap-[18px]">
              {buyFirst.length > 0 && (
                <section className="flex flex-col gap-2">
                  <SectionLabel>Buy first</SectionLabel>
                  <div className="overflow-hidden rounded-2xl border border-[var(--hh-line)] shadow-[0_1px_2px_rgba(15,23,42,0.04)] divide-y divide-[var(--hh-line)]" style={{ background: "var(--hh-surface)" }}>
                    {buyFirst.map((row) => (
                      <div key={`${row.taskInstanceId}:${row.supplyIndex}`} className="flex items-start gap-3 px-3.5 py-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px]" style={{ background: "var(--hh-gold-soft)", color: "var(--hh-gold)" }}>
                          <ShoppingBagIcon className="size-[18px]" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[14.5px] font-semibold tracking-[-0.2px]" style={{ color: INK }}>
                            {row.supply.name}{row.supply.size ? ` · ${row.supply.size}` : ""}
                          </div>
                          <div className="text-[12.5px]" style={{ color: SUB }}>
                            {row.taskTitle} · {row.duePhrase}
                          </div>
                          <div className="mt-2 flex items-center gap-3">
                            {row.supply.url && (
                              <a href={row.supply.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[13px] font-semibold" style={{ color: TEAL }}>
                                Buy <ExternalLinkIcon className="size-3" />
                              </a>
                            )}
                            <button type="button" onClick={() => void markHave(row)} className="text-[12.5px] font-semibold" style={{ color: SUB }}>
                              I have one
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {haveError && <div role="alert" className="text-[12.5px]" style={{ color: "var(--hh-clay)" }}>{haveError}</div>}
                </section>
              )}

              <section className="flex flex-col gap-2">
                <SectionLabel>This week</SectionLabel>
                {thisWeek.length === 0 ? (
                  <div className="rounded-2xl border border-[var(--hh-line)] px-4 py-5 text-center" style={{ background: "var(--hh-surface)" }}>
                    <div className="text-[14.5px] font-semibold" style={{ color: INK }}>Nothing needs you this week.</div>
                    <div className="mt-1 text-[12.5px]" style={{ color: SUB }}>
                      Reminders you turn on show up here.{" "}
                      <Link to="/settings#reminders" className="font-semibold" style={{ color: TEAL }}>Your reminders</Link>
                    </div>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-2xl border border-[var(--hh-line)] shadow-[0_1px_2px_rgba(15,23,42,0.04)] divide-y divide-[var(--hh-line)]" style={{ background: "var(--hh-surface)" }}>
                    {thisWeek.map((t) => (
                      <ReminderRow key={t.taskInstanceId} t={t} chip={dayChip(t.dueDate, true) || t.duePhrase} />
                    ))}
                  </div>
                )}
              </section>

              {later.length > 0 && (
                <section className="flex flex-col gap-2">
                  <SectionLabel>Coming up</SectionLabel>
                  <div className="overflow-hidden rounded-2xl border border-[var(--hh-line)] shadow-[0_1px_2px_rgba(15,23,42,0.04)] divide-y divide-[var(--hh-line)]" style={{ background: "var(--hh-surface)" }}>
                    {later.map((t) => (
                      <Link key={t.taskInstanceId} to={`/tasks/${t.taskInstanceId}`} className="flex items-center gap-3 px-3.5 py-2.5">
                        <span className="min-w-0 flex-1 truncate text-[14.5px] font-medium" style={{ color: SUB }}>{t.title}</span>
                        <span className="shrink-0 text-[12.5px] font-semibold" style={{ color: FAINT }}>{dayChip(t.dueDate, false)}</span>
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              {data.hiddenCount > 0 && (
                <Link to="/maintenance" className="text-center text-[12.5px] font-semibold" style={{ color: TEAL }}>
                  {data.hiddenCount} more {data.hiddenCount === 1 ? "task" : "tasks"} in Tasks — not on your reminders
                </Link>
              )}

              <div className="flex items-center justify-center gap-1.5 text-[12px]" style={{ color: FAINT }}>
                <BellIcon className="size-3.5" />
                {digest.enabled ? (
                  <span>This summary arrives {DAY_NAMES[digest.day]}s at {hourLabel(digest.hour)} ·</span>
                ) : (
                  <span>The weekly summary is off ·</span>
                )}
                <Link to="/settings#notifications" className="font-semibold" style={{ color: TEAL }}>{digest.enabled ? "Change" : "Turn on"}</Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Desktop: the same column, centered — the redesign has no wide layout for this page yet. */}
      <div className="hidden lg:block">
        <div className="mx-auto w-full max-w-[560px]">
          <Link to="/home" className="text-[13px] font-semibold" style={{ color: SUB }}>← Home</Link>
          <h1 className="mt-2 text-[24px] font-extrabold tracking-[-0.4px]" style={{ color: INK }}>Your week</h1>
          <p className="mb-4 text-[13px]" style={{ color: SUB }}>{shortDate(0)} – {shortDate(7)} · from your reminders</p>
          {data && thisWeek.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-[var(--hh-line)] divide-y divide-[var(--hh-line)]" style={{ background: "var(--hh-surface)" }}>
              {thisWeek.map((t) => <ReminderRow key={t.taskInstanceId} t={t} chip={dayChip(t.dueDate, true) || t.duePhrase} />)}
            </div>
          )}
          {data && thisWeek.length === 0 && <div className="text-[14px]" style={{ color: SUB }}>Nothing needs you this week.</div>}
          {error && !data && <div role="alert" className="text-[14px]" style={{ color: "var(--hh-clay)" }}>Couldn&apos;t load your week — {error.message}</div>}
        </div>
      </div>
    </PageContainer>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <span className="pl-0.5 text-xs font-bold uppercase tracking-[0.6px]" style={{ color: SUB }}>{children}</span>
}

function ReminderRow({ t, chip }: { t: WeekReminder; chip: string }) {
  const tier = asTier(t.priorityTier)
  const meta = [t.itemName, t.estimatedMinutes != null ? `${t.estimatedMinutes} min` : null].filter(Boolean).join(" · ")
  return (
    <Link to={`/tasks/${t.taskInstanceId}`} className="flex items-center gap-3 px-3.5 py-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full border-2" style={{ borderColor: TEAL }}>
        <CheckIcon className="size-3 opacity-0" strokeWidth={3} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-semibold leading-snug tracking-[-0.2px] text-pretty" style={{ color: INK }}>{t.title}</span>
        <span className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className="rounded-full px-2 py-0.5 text-[10.5px] font-bold" style={{ background: TIER[tier].soft, color: TIER[tier].dot }}>{TIER[tier].label}</span>
          {meta && <span className="text-[12.5px]" style={{ color: SUB }}>{meta}</span>}
        </span>
      </span>
      <span className="shrink-0 text-[12.5px] font-semibold" style={{ color: FAINT }}>{chip}</span>
    </Link>
  )
}
