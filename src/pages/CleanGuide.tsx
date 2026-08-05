import { useEffect, useState } from "react"
import { useParams, useNavigate, Link } from "react-router-dom"
import { ChevronLeftIcon, ClockIcon, MapPinIcon, SparklesIcon } from "lucide-react"
import { useCurrentHome } from "@/modules/home"
import { getItemCleanGuide, type ItemCleanGuide } from "@/lib/cleanSession"
import { HowToSteps } from "@/components/tasks/HowToSteps"

const INK = "var(--hh-ink)", SUB = "var(--hh-sub)", TEAL = "var(--hh-teal)", BG = "var(--hh-bg)"

/**
 * Per-appliance deep-clean guide (/clean/:itemUnitId). Assembles the item's
 * manual-parsed cleaning tasks into a real step-by-step guide — each task is a
 * numbered section with its structured steps (warnings split into a caution
 * callout) and cited supplies. Replaces the old dead-end link to the /clean hub.
 */
export default function CleanGuide() {
  const { itemUnitId } = useParams<{ itemUnitId: string }>()
  const navigate = useNavigate()
  const { home } = useCurrentHome()
  const homeId = home?.home_id ?? null
  const [guide, setGuide] = useState<ItemCleanGuide | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!homeId || !itemUnitId) return
    let cancelled = false
    setLoading(true)
    getItemCleanGuide(homeId, itemUnitId)
      .then((g) => { if (!cancelled) setGuide(g) })
      .catch(() => { if (!cancelled) setGuide(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [homeId, itemUnitId])

  return (
    <div className="mx-auto min-h-[calc(100vh-48px)] w-full max-w-[820px] px-5 pb-16" style={{ background: BG }}>
      <div className="flex items-center pt-1 pb-2">
        <button onClick={() => navigate(-1)} className="inline-flex items-center gap-0.5 py-1.5 text-[16px] font-semibold" style={{ color: TEAL }}>
          <ChevronLeftIcon className="size-[22px]" strokeWidth={2.4} /> Back
        </button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-[14px]" style={{ color: SUB }}>Loading guide…</div>
      ) : !guide ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-[15px]" style={{ color: SUB }}>No cleaning guide for this item yet.</p>
          <Link to="/clean" className="text-[14px] font-bold" style={{ color: TEAL }}>Back to Deep Clean</Link>
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="rounded-[20px] p-5 shadow-[0_1px_2px_rgba(15,23,42,0.05)]" style={{ background: "var(--hh-surface)" }}>
            <div className="flex items-center gap-3.5">
              <div className="flex size-[52px] shrink-0 items-center justify-center rounded-2xl" style={{ background: "var(--hh-teal-wash)", color: TEAL }}>
                <SparklesIcon className="size-6" strokeWidth={2} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-bold uppercase tracking-[0.5px]" style={{ color: TEAL }}>Deep-clean guide</div>
                <h1 className="mt-0.5 text-[26px] font-extrabold leading-tight tracking-[-0.6px]" style={{ color: INK }}>Clean the {guide.itemName}</h1>
              </div>
            </div>
            <div className="mt-3.5 flex flex-wrap gap-x-4 gap-y-2 text-[13.5px]" style={{ color: SUB }}>
              {guide.roomName && <span className="inline-flex items-center gap-1.5"><MapPinIcon className="size-[15px]" /> {guide.roomName}</span>}
              <span className="inline-flex items-center gap-1.5"><SparklesIcon className="size-[15px]" /> {guide.tasks.length} step{guide.tasks.length === 1 ? "" : "s"}</span>
              {guide.totalMinutes > 0 && <span className="inline-flex items-center gap-1.5"><ClockIcon className="size-[15px]" /> about {guide.totalMinutes} min</span>}
            </div>
          </div>

          {/* Each cleaning task → a numbered guide section */}
          <div className="mt-5 flex flex-col gap-4">
            {guide.tasks.map((t, i) => (
              <div key={t.taskTemplateId} className="rounded-[18px] p-5 shadow-[0_1px_2px_rgba(15,23,42,0.05)]" style={{ background: "var(--hh-surface)" }}>
                <div className="mb-3 flex items-center gap-3">
                  {/* The ONLY number on this screen: which section of the guide
                      you're in. Solid, so it reads as a marker rather than a
                      sibling of the step circles below it. */}
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold text-white" style={{ background: TEAL }}>{i + 1}</span>
                  <h2 className="min-w-0 flex-1 text-[16px] font-extrabold tracking-[-0.3px]" style={{ color: INK }}>{t.title}</h2>
                  {t.estimatedMinutes != null && <span className="shrink-0 text-[12.5px] font-semibold" style={{ color: SUB }}>{t.estimatedMinutes} min</span>}
                </div>
                <HowToSteps notes={t.instructions} steps={t.steps} supplies={t.supplies} stepsLabel="" />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
