import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { CheckIcon, SparklesIcon, MessageCircleIcon, ShieldAlertIcon, PhoneIcon } from "lucide-react"
import { useAuth } from "@/modules/auth"
import {
  getFeedbackContext, submitTaskFeedback, discussTask, proposalToResolution,
  type FeedbackChip, type Resolution, type FeedbackContext, type SubmitFeedbackResult,
  type DiscussMessage, type DiscussProposal,
} from "@/modules/care"
import { upsertHomeProfile } from "@/modules/home"
import { ChatInput } from "@/components/chat/ChatInput"
import type { PriorityTier, ScheduleType, Season } from "@/integrations/types"

const INK = "var(--hh-ink)", SUB = "var(--hh-sub)", TEAL = "var(--hh-teal)", FAINT = "var(--hh-faint)", CLAY = "var(--hh-clay)"

const CHIPS: { key: FeedbackChip; label: string; hint: string }[] = [
  { key: "not_relevant", label: "Not relevant to my home", hint: "Hide it (and similar tasks)" },
  { key: "wrong_priority", label: "Wrong priority", hint: "Change how important it is" },
  { key: "too_often", label: "Too often", hint: "Do it less frequently" },
  { key: "wrong_season", label: "Wrong timing / season", hint: "Move it to the right season" },
  { key: "duplicate", label: "Duplicate", hint: "Remove this copy" },
]
const TIER_OPTS: { key: PriorityTier; label: string }[] = [
  { key: "essential", label: "Essential" },
  { key: "recommended", label: "Recommended" },
  { key: "optional", label: "Optional" },
]
const CADENCE_OPTS: { key: ScheduleType; label: string }[] = [
  { key: "monthly", label: "Monthly" },
  { key: "quarterly", label: "Every 3 months" },
  { key: "semiannual", label: "Every 6 months" },
  { key: "annual", label: "Yearly" },
]
const SEASON_OPTS: { key: Season; label: string }[] = [
  { key: "spring", label: "Spring" },
  { key: "summer", label: "Summer" },
  { key: "fall", label: "Fall" },
  { key: "winter", label: "Winter" },
]

/** A resolution that reduces the task's attention — the safety-pushback trigger. */
function isDowngrade(r: Resolution): boolean {
  return r.action === "suppress" || r.action === "archive_duplicate" || (r.action === "tier_remap" && r.toTier === "optional")
}

function Choice({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[11px] px-3.5 py-2.5 text-left text-[13.5px] font-semibold"
      style={selected
        ? { border: "1.5px solid var(--hh-teal)", background: "var(--hh-teal-wash)", color: TEAL }
        : { border: "1px solid var(--hh-line2)", background: "var(--hh-surface)", color: INK }}
    >
      {label}
    </button>
  )
}

export function TaskFeedbackSheet({
  homeId, taskTemplateId, taskInstanceId, title, tier, justification, manualPage, hazardous,
  onClose, onApplied,
}: {
  homeId: string
  taskTemplateId: string
  taskInstanceId: string | null
  title: string
  tier: PriorityTier
  justification?: string | null
  manualPage?: number | null
  hazardous?: boolean
  onClose: () => void
  onApplied: (r: SubmitFeedbackResult) => void
}) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [chip, setChip] = useState<FeedbackChip | null>(null)
  const [tierChoice, setTierChoice] = useState<PriorityTier | null>(null)
  const [cadenceChoice, setCadenceChoice] = useState<ScheduleType | null>(null)
  const [seasonChoice, setSeasonChoice] = useState<Season | null>(null)
  const [note, setNote] = useState("")
  const [step, setStep] = useState<"choose" | "discuss" | "pushback" | "confirm">("choose")
  const [via, setVia] = useState<"chip" | "discuss">("chip")
  const [ctx, setCtx] = useState<FeedbackContext | null>(null)
  const [sweep, setSweep] = useState<Set<string>>(new Set())
  const [freezeFree, setFreezeFree] = useState(false)
  const [loadingCtx, setLoadingCtx] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<SubmitFeedbackResult | null>(null)

  // Discuss (Phase C) state
  const [messages, setMessages] = useState<DiscussMessage[]>([])
  const [discussLoading, setDiscussLoading] = useState(false)
  const [discussProposal, setDiscussProposal] = useState<DiscussProposal | null>(null)
  const [discussError, setDiscussError] = useState<string | null>(null)
  const threadRef = useRef<HTMLDivElement>(null)

  const resolution: Resolution | null = useMemo(() => {
    switch (chip) {
      case "not_relevant": return { action: "suppress" }
      case "duplicate": return { action: "archive_duplicate" }
      case "wrong_priority": return tierChoice ? { action: "tier_remap", toTier: tierChoice } : null
      case "too_often": return cadenceChoice ? { action: "cadence", scheduleType: cadenceChoice, intervalDays: null } : null
      case "wrong_season": return seasonChoice ? { action: "reschedule_season", season: seasonChoice } : null
      default: return null
    }
  }, [chip, tierChoice, cadenceChoice, seasonChoice])

  const sweepEligible = chip !== null && chip !== "duplicate"
  const isFreezePrep = ctx?.match.by === "seasonalFamily" && ctx.match.family === "freeze_prep"

  // On entering confirm for a sweep-eligible chip, load similar tasks (default all checked).
  useEffect(() => {
    if (step !== "confirm" || !sweepEligible) return
    let cancelled = false
    setLoadingCtx(true)
    getFeedbackContext(homeId, taskTemplateId).then((res) => {
      if (cancelled) return
      setCtx(res.data ?? null)
      setSweep(new Set((res.data?.similar ?? []).map((s) => s.taskTemplateId)))
      setLoadingCtx(false)
    })
    return () => { cancelled = true }
  }, [step, sweepEligible, homeId, taskTemplateId])

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight })
  }, [messages, discussLoading])

  const planSummary = useMemo(() => {
    switch (resolution?.action) {
      case "suppress": return `Hide "${title}"`
      case "archive_duplicate": return `Remove "${title}" as a duplicate`
      case "tier_remap": return `Change priority to ${TIER_OPTS.find((t) => t.key === resolution.toTier)?.label}`
      case "cadence": return `Change to ${CADENCE_OPTS.find((c) => c.key === resolution.scheduleType)?.label.toLowerCase()}`
      case "reschedule_season": return `Move to ${SEASON_OPTS.find((s) => s.key === resolution.season)?.label}`
      default: return ""
    }
  }, [resolution, title])

  const affectedCount = 1 + (sweepEligible ? sweep.size : 0)

  /** Route a fully-specified resolution to the safety gate (hazard downgrade) or confirm. */
  function proceed() {
    if (!resolution) return
    setError(null)
    if (hazardous && isDowngrade(resolution)) setStep("pushback")
    else setStep("confirm")
  }

  function acceptProposal(p: DiscussProposal) {
    const r = proposalToResolution(p)
    if (!r) return
    setVia("discuss")
    if (p.action === "suppress") setChip("not_relevant")
    else if (p.action === "tier_remap") { setChip("wrong_priority"); setTierChoice(p.toTier ?? null) }
    else if (p.action === "cadence") { setChip("too_often"); setCadenceChoice(p.scheduleType ?? null) }
    else if (p.action === "reschedule_season") { setChip("wrong_season"); setSeasonChoice(p.season ?? null) }
    if (hazardous && isDowngrade(r)) setStep("pushback")
    else setStep("confirm")
  }

  async function sendDiscuss(text: string) {
    const history = messages
    setMessages((m) => [...m, { role: "user", content: text }])
    setDiscussLoading(true); setDiscussProposal(null); setDiscussError(null)
    const res = await discussTask(homeId, taskTemplateId, text, history)
    setDiscussLoading(false)
    if (res.error) { setDiscussError(res.error.message); return }
    setMessages((m) => [...m, { role: "assistant", content: res.data.explanation }])
    setDiscussProposal(res.data.proposal)
  }

  async function apply() {
    if (!resolution || !user) return
    setSubmitting(true); setError(null)
    const res = await submitTaskFeedback({
      homeId,
      uid: user.id,
      primary: { taskTemplateId, taskInstanceId, title },
      chip: chip!,
      resolution,
      note: note.trim() || null,
      sweepTemplateIds: sweepEligible ? [...sweep] : [],
      match: sweepEligible ? (ctx?.match ?? null) : null,
      via,
      hazardOverride: !!hazardous && isDowngrade(resolution),
    })
    if (!res.error && freezeFree && isFreezePrep) {
      // Backfill the home profile so future parses skip winterizing too (the loop).
      await upsertHomeProfile(homeId, { climate: "mild", freeze_risk: false })
    }
    setSubmitting(false)
    if (res.error) { setError(res.error.message); return }
    setResult(res.data)
  }

  const toggleSweep = (id: string) =>
    setSweep((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })

  return (
    <>
      <div onClick={onClose} className="absolute inset-0 z-40" style={{ background: "rgba(8,12,11,0.4)" }} />
      <div
        className="absolute inset-x-0 bottom-0 z-[41] flex max-h-[88%] flex-col overflow-hidden rounded-t-[20px] shadow-[0_-8px_30px_rgba(0,0,0,0.18)]"
        style={{ background: "var(--hh-surface)" }}
        role="dialog"
        aria-label="Tune this task"
      >
        <div className="shrink-0 px-5 pt-4">
          <div className="mx-auto mb-3 h-1 w-9 rounded-full" style={{ background: "rgba(15,23,42,0.15)" }} />
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-[calc(18px+env(safe-area-inset-bottom))]" style={{ display: step === "discuss" ? "flex" : "block", flexDirection: "column" }}>
        {/* ── SUCCESS ── */}
        {result ? (
          <div className="pb-2">
            <div className="mb-1 flex items-center gap-2.5">
              <span className="flex size-[30px] items-center justify-center rounded-full" style={{ background: TEAL }}>
                <CheckIcon className="size-[17px] text-white" strokeWidth={3} />
              </span>
              <div className="text-[22px] font-extrabold tracking-[-0.4px]" style={{ color: INK }}>Thanks — done</div>
            </div>
            <p className="mb-4 text-[13.5px]" style={{ color: SUB }}>
              Updated {result.affected} task{result.affected === 1 ? "" : "s"}.
              {result.ruleId ? " Saved as a house rule you can review in Settings." : ""}
            </p>
            <button onClick={() => onApplied(result)} className="w-full rounded-[14px] py-3.5 text-[15px] font-bold text-white" style={{ background: TEAL }}>Done</button>
          </div>
        ) : step === "choose" ? (
          /* ── STEP 1: pick a reason ── */
          <>
            <div className="text-[20px] font-extrabold tracking-[-0.4px]" style={{ color: INK }}>Tune this task</div>
            <p className="mb-4 mt-0.5 text-[13.5px] leading-snug" style={{ color: SUB }}>
              What's off about <span className="font-semibold" style={{ color: INK }}>{title}</span>?
            </p>

            <div className="flex flex-col gap-2">
              {CHIPS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => { setChip(c.key); setTierChoice(null); setCadenceChoice(null); setSeasonChoice(null); setVia("chip") }}
                  className="flex items-center justify-between rounded-[12px] px-3.5 py-3 text-left"
                  style={chip === c.key
                    ? { border: "1.5px solid var(--hh-teal)", background: "var(--hh-teal-wash)" }
                    : { border: "1px solid var(--hh-line2)", background: "var(--hh-surface)" }}
                >
                  <span>
                    <span className="block text-[14.5px] font-bold" style={{ color: chip === c.key ? TEAL : INK }}>{c.label}</span>
                    <span className="block text-[12px]" style={{ color: SUB }}>{c.hint}</span>
                  </span>
                  {chip === c.key && <CheckIcon className="size-[18px]" strokeWidth={2.6} style={{ color: TEAL }} />}
                </button>
              ))}
              {/* Discuss — AI conversation (Phase C) */}
              <button
                type="button"
                onClick={() => setStep("discuss")}
                className="flex items-center gap-2 rounded-[12px] px-3.5 py-3 text-left"
                style={{ border: "1px solid var(--hh-line2)", background: "var(--hh-surface)" }}
              >
                <MessageCircleIcon className="size-[16px]" style={{ color: TEAL }} />
                <span className="flex-1">
                  <span className="block text-[14.5px] font-bold" style={{ color: INK }}>Discuss with the assistant</span>
                  <span className="block text-[12px]" style={{ color: SUB }}>Ask why it's here, or talk it through</span>
                </span>
              </button>
            </div>

            {chip === "wrong_priority" && (
              <SubPicker label="Set priority to">
                {TIER_OPTS.filter((t) => t.key !== tier).map((t) => (
                  <Choice key={t.key} label={t.label} selected={tierChoice === t.key} onClick={() => setTierChoice(t.key)} />
                ))}
              </SubPicker>
            )}
            {chip === "too_often" && (
              <SubPicker label="How often instead?">
                {CADENCE_OPTS.map((c) => (
                  <Choice key={c.key} label={c.label} selected={cadenceChoice === c.key} onClick={() => setCadenceChoice(c.key)} />
                ))}
              </SubPicker>
            )}
            {chip === "wrong_season" && (
              <SubPicker label="When should it happen?">
                {SEASON_OPTS.map((s) => (
                  <Choice key={s.key} label={s.label} selected={seasonChoice === s.key} onClick={() => setSeasonChoice(s.key)} />
                ))}
              </SubPicker>
            )}

            <button
              disabled={!resolution}
              onClick={proceed}
              className="mt-5 w-full rounded-[14px] py-3.5 text-[15px] font-bold text-white disabled:opacity-40"
              style={{ background: TEAL }}
            >
              Continue
            </button>
          </>
        ) : step === "discuss" ? (
          /* ── DISCUSS: AI conversation ── */
          <>
            <div className="shrink-0 text-[20px] font-extrabold tracking-[-0.4px]" style={{ color: INK }}>Discuss</div>
            <p className="shrink-0 mb-3 mt-0.5 text-[13px] leading-snug" style={{ color: SUB }}>
              About <span className="font-semibold" style={{ color: INK }}>{title}</span>. Grounded in your manual and home profile.
            </p>
            <div ref={threadRef} className="min-h-[120px] flex-1 space-y-2.5 overflow-y-auto">
              {messages.length === 0 && !discussLoading && (
                <div className="rounded-xl px-3.5 py-3 text-[13.5px] leading-snug" style={{ background: "var(--hh-surface2)", color: SUB }}>
                  Try: "Why is this Essential?" · "We're in a mild climate — does this apply?" · "Can I do this less often?"
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                  <div
                    className="max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-snug"
                    style={m.role === "user"
                      ? { background: TEAL, color: "white" }
                      : { background: "var(--hh-surface2)", color: INK }}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
              {discussLoading && (
                <div className="flex justify-start">
                  <div className="rounded-2xl px-3.5 py-2.5 text-[13.5px]" style={{ background: "var(--hh-surface2)", color: FAINT }}>Thinking…</div>
                </div>
              )}
              {discussProposal && !discussLoading && (
                <div className="rounded-xl p-3" style={{ border: "1.5px solid var(--hh-teal)", background: "var(--hh-teal-wash)" }}>
                  <div className="flex items-start gap-2">
                    <SparklesIcon className="mt-0.5 size-[15px] shrink-0" style={{ color: TEAL }} />
                    <span className="text-[13px] leading-snug" style={{ color: "#3A4A45" }}>{discussProposal.rationale}</span>
                  </div>
                  <button onClick={() => acceptProposal(discussProposal)} className="mt-2.5 w-full rounded-[12px] py-2.5 text-[13.5px] font-bold text-white" style={{ background: TEAL }}>
                    Apply this change
                  </button>
                </div>
              )}
              {discussError && <p className="text-[13px] font-semibold" style={{ color: CLAY }}>{discussError}</p>}
            </div>
            <div className="shrink-0 pt-2">
              <ChatInput onSend={sendDiscuss} disabled={discussLoading} />
              <button onClick={() => setStep("choose")} className="mt-2 text-[13px] font-semibold" style={{ color: SUB }}>← Back to options</button>
            </div>
          </>
        ) : step === "pushback" ? (
          /* ── SAFETY PUSHBACK (hazard downgrade) ── */
          <>
            <div className="mb-1 flex items-center gap-2.5">
              <span className="flex size-[30px] items-center justify-center rounded-full" style={{ background: "var(--hh-clay-soft)" }}>
                <ShieldAlertIcon className="size-[18px]" style={{ color: CLAY }} />
              </span>
              <div className="text-[20px] font-extrabold tracking-[-0.4px]" style={{ color: INK }}>A safety check first</div>
            </div>
            <div className="mt-3 rounded-xl px-3.5 py-3 text-[13.5px] leading-relaxed text-pretty" style={{ background: "var(--hh-surface2)", color: "#3A4A45" }}>
              {justification?.trim() || "This task guards against a gas, combustion, or electrical hazard."}
              {manualPage != null && <> The manual covers the full procedure and warnings on p.{manualPage}.</>}
              <div className="mt-2 font-semibold" style={{ color: INK }}>Gas, combustion, and electrical work is best left to a licensed professional.</div>
            </div>
            <button
              onClick={() => { onClose(); navigate("/providers") }}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-[14px] py-3.5 text-[15px] font-bold text-white"
              style={{ background: TEAL }}
            >
              <PhoneIcon className="size-[16px]" /> Talk to a pro
            </button>
            <div className="mt-2.5 flex gap-2.5">
              <button onClick={onClose} className="flex-1 rounded-[14px] py-3 text-[14px] font-bold" style={{ border: "1.5px solid var(--hh-line2)", background: "var(--hh-surface)", color: INK }}>Keep the task</button>
              <button onClick={() => setStep("confirm")} className="flex-1 rounded-[14px] py-3 text-[14px] font-bold" style={{ border: "1.5px solid var(--hh-line2)", background: "var(--hh-surface)", color: SUB }}>Continue anyway</button>
            </div>
          </>
        ) : (
          /* ── CONFIRM + sweep ── */
          <>
            <div className="text-[20px] font-extrabold tracking-[-0.4px]" style={{ color: INK }}>Confirm</div>
            <div className="mt-3 flex items-start gap-2.5 rounded-xl px-3.5 py-3" style={{ background: "var(--hh-surface2)" }}>
              <SparklesIcon className="mt-0.5 size-[15px] shrink-0" style={{ color: TEAL }} />
              <span className="text-[13.5px] font-semibold leading-snug text-pretty" style={{ color: "#3A4A45" }}>{planSummary}.</span>
            </div>

            {sweepEligible && (
              <div className="mt-4">
                {loadingCtx ? (
                  <div className="text-[13px]" style={{ color: FAINT }}>Looking for similar tasks…</div>
                ) : (ctx?.similar.length ?? 0) > 0 ? (
                  <>
                    <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.5px]" style={{ color: SUB }}>
                      Also apply to similar tasks
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {ctx!.similar.map((s) => {
                        const on = sweep.has(s.taskTemplateId)
                        return (
                          <button
                            key={s.taskTemplateId}
                            type="button"
                            onClick={() => toggleSweep(s.taskTemplateId)}
                            className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left"
                            style={{ border: on ? "1.5px solid var(--hh-teal)" : "1px solid var(--hh-line2)", background: on ? "var(--hh-teal-wash)" : "var(--hh-surface)" }}
                          >
                            <span className="flex size-[20px] shrink-0 items-center justify-center rounded-[6px]" style={{ border: on ? "none" : "1.5px solid var(--hh-line2)", background: on ? TEAL : "transparent" }}>
                              {on && <CheckIcon className="size-[13px] text-white" strokeWidth={3} />}
                            </span>
                            <span className="text-[13.5px] font-semibold" style={{ color: INK }}>{s.title}</span>
                          </button>
                        )
                      })}
                    </div>
                  </>
                ) : (
                  <div className="text-[13px]" style={{ color: FAINT }}>No similar tasks — this applies to just this one.</div>
                )}
              </div>
            )}

            {isFreezePrep && chip === "not_relevant" && (
              <button
                type="button"
                onClick={() => setFreezeFree((v) => !v)}
                className="mt-4 flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left"
                style={{ border: freezeFree ? "1.5px solid var(--hh-teal)" : "1px solid var(--hh-line2)", background: freezeFree ? "var(--hh-teal-wash)" : "var(--hh-surface)" }}
              >
                <span className="flex size-[20px] shrink-0 items-center justify-center rounded-[6px]" style={{ border: freezeFree ? "none" : "1.5px solid var(--hh-line2)", background: freezeFree ? TEAL : "transparent" }}>
                  {freezeFree && <CheckIcon className="size-[13px] text-white" strokeWidth={3} />}
                </span>
                <span className="text-[13px] font-semibold leading-snug" style={{ color: INK }}>My home doesn't freeze — skip winterizing on future scans too</span>
              </button>
            )}

            <div className="mt-4">
              <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.5px]" style={{ color: SUB }}>Add a note (optional)</div>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="e.g. we're in a mild climate"
                className="w-full resize-none rounded-xl px-3 py-2.5 text-[14px]"
                style={{ border: "1px solid var(--hh-line2)", background: "var(--hh-surface)", color: INK }}
              />
            </div>

            {error && <p className="mt-3 text-[13px] font-semibold" style={{ color: CLAY }}>{error}</p>}

            <div className="mt-5 flex gap-2.5">
              <button onClick={() => { setStep("choose"); setError(null) }} className="rounded-[14px] px-4 py-3.5 text-[14px] font-bold" style={{ border: "1.5px solid var(--hh-line2)", background: "var(--hh-surface)", color: INK }}>Back</button>
              <button
                disabled={submitting || loadingCtx}
                onClick={apply}
                className="flex-1 rounded-[14px] py-3.5 text-[15px] font-bold text-white disabled:opacity-50"
                style={{ background: TEAL }}
              >
                {submitting ? "Applying…" : `Apply${affectedCount > 1 ? ` to ${affectedCount} tasks` : ""}`}
              </button>
            </div>
          </>
        )}
        </div>
      </div>
    </>
  )
}

function SubPicker({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.5px]" style={{ color: SUB }}>{label}</div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}
