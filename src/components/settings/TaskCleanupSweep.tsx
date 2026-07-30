/**
 * Task-cleanup sweep UI — the confirm-first review pass over a home's existing
 * tasks (the 2026-07-29 decision: "generate the change list and let me approve it
 * in one pass").
 *
 * Everything is opt-out per row. Reversible edits (reclassify / demote / convert
 * to a tip) start CHECKED; duplicate merges start UNCHECKED, because measured
 * title similarity can't tell a real duplicate from a look-alike — see
 * shared/tasks/cleanupPlan.ts. Demotions additionally offer "keep Essential",
 * which is how a hygiene-critical or manual-emphasized task earns Essential by
 * the owner's choice rather than the model's.
 */
import { useState } from "react"
import { AlertCircleIcon, CheckCircle2Icon, Loader2Icon, SparklesIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  buildCleanupPlan,
  applyCleanupPlan,
  proposalKey,
  type CleanupPlan,
  type CleanupProposal,
  type ApplyCleanupResult,
} from "@/modules/care/services/taskCleanupService"
import { isDefaultChecked } from "../../../shared/tasks/cleanupPlan"

const GROUPS: Array<{
  kind: CleanupProposal["kind"]
  label: string
  hint: string
}> = [
  { kind: "to_tip", label: "Move out of tasks → “Using it well” tip", hint: "Operating the appliance, not upkeep. The advice stays on the item page; the reminder goes away." },
  { kind: "retier", label: "Demote from Essential", hint: "Essential is reserved for safety or damage-prevention maintenance. Tick “keep Essential” for any you want alerts on." },
  { kind: "reclassify", label: "Fix cleaning vs maintenance", hint: "Wipe-downs move off the Home agenda into the item's Cleaning group; functional upkeep filed as cleaning (descaling, filters, vents) moves back onto the agenda where it belongs." },
  { kind: "merge", label: "Merge duplicates", hint: "Same job listed twice. Unchecked by default — look-alike titles score the same as true duplicates, so please confirm each one." },
]

export function TaskCleanupSweep({ homeId }: { homeId: string }) {
  const [phase, setPhase] = useState<"idle" | "planning" | "review" | "applying" | "done">("idle")
  const [plan, setPlan] = useState<CleanupPlan | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [promote, setPromote] = useState<Set<string>>(new Set())
  const [result, setResult] = useState<ApplyCleanupResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const runPlan = async () => {
    setPhase("planning")
    setError(null)
    setResult(null)
    try {
      const p = await buildCleanupPlan(homeId)
      setPlan(p)
      setChecked(new Set(p.proposals.filter(isDefaultChecked).map(proposalKey)))
      setPromote(new Set())
      setPhase("review")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read this home's tasks")
      setPhase("idle")
    }
  }

  const apply = async () => {
    if (!plan) return
    setPhase("applying")
    setError(null)
    try {
      const approved = plan.proposals.filter((p) => checked.has(proposalKey(p)))
      const res = await applyCleanupPlan(homeId, approved, promote)
      setResult(res)
      setPlan(null)
      setPhase("done")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not apply the changes")
      setPhase("review")
    }
  }

  const toggle = (key: string, set: Set<string>, setter: (s: Set<string>) => void) => {
    const next = new Set(set)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setter(next)
  }

  const approvedCount = plan ? plan.proposals.filter((p) => checked.has(proposalKey(p))).length : 0

  return (
    <div>
      <p className="text-sm font-medium text-foreground">Clean up existing tasks</p>
      <p className="text-xs text-muted-foreground mt-0.5 mb-2">
        Reviews every task in this home against the current rules — operating steps become tips,
        appearance cleaning moves off the Home agenda, Essential is limited to safety and
        damage-prevention maintenance, and duplicate pairs are offered for merging. Nothing is
        written until you approve the list. No AI call, so a dry run is free and repeatable.
      </p>

      {phase === "idle" && (
        <Button variant="outline" size="sm" onClick={runPlan}>
          <SparklesIcon className="size-3.5 mr-1.5" />
          Review proposed changes
        </Button>
      )}

      {phase === "planning" && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2Icon className="size-3.5 animate-spin" /> Checking this home's tasks…
        </p>
      )}

      {phase === "done" && result && (
        <div className="flex items-start gap-2 rounded-lg bg-primary/10 p-2 text-primary">
          <CheckCircle2Icon className="mt-0.5 size-4 shrink-0" />
          <div className="text-xs">
            <p className="font-medium">Applied.</p>
            <p className="mt-0.5">
              {result.convertedToTips} moved to tips · {result.retiered} retiered ·{" "}
              {result.reclassified} reclassified · {result.merged} merged
            </p>
            <button type="button" onClick={runPlan} className="mt-1 font-semibold underline underline-offset-2">
              Run again
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-2 flex items-start gap-2 rounded-lg bg-destructive/10 p-2 text-destructive">
          <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
          <p className="text-xs">{error}</p>
        </div>
      )}

      {plan && (phase === "review" || phase === "applying") && (
        <div className="mt-3">
          {plan.proposals.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nothing to change — this home's tasks already match the current rules.
            </p>
          ) : (
            <>
              {GROUPS.map((group) => {
                const rows = plan.proposals.filter((p) => p.kind === group.kind)
                if (rows.length === 0) return null
                return (
                  <div key={group.kind} className="mb-3 border-t border-border pt-2.5 first:border-t-0 first:pt-0">
                    <p className="text-xs font-semibold text-foreground">
                      {group.label} <span className="font-normal text-muted-foreground">({rows.length})</span>
                    </p>
                    <p className="mb-1.5 text-[11px] leading-snug text-muted-foreground">{group.hint}</p>
                    <ul className="space-y-1.5">
                      {rows.map((p) => {
                        const key = proposalKey(p)
                        const on = checked.has(key)
                        return (
                          <li key={key} className="flex items-start gap-2">
                            <input
                              id={key}
                              type="checkbox"
                              checked={on}
                              onChange={() => toggle(key, checked, setChecked)}
                              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded accent-primary"
                            />
                            <label htmlFor={key} className="min-w-0 flex-1 cursor-pointer text-xs">
                              {p.kind === "merge" ? (
                                <>
                                  <span className="font-medium text-foreground">Keep “{p.keepTitle}”</span>
                                  <span className="text-muted-foreground">, remove “{p.dropTitle}”</span>
                                  <span className="ml-1 text-[10px] text-muted-foreground">
                                    ({Math.round(p.similarity * 100)}% similar)
                                  </span>
                                </>
                              ) : (
                                <>
                                  <span className="font-medium text-foreground">{p.title}</span>
                                  {p.kind === "reclassify" && (
                                    <span className="ml-1 text-[10px] text-muted-foreground">
                                      {p.from} → {p.to}
                                    </span>
                                  )}
                                </>
                              )}
                              {p.itemName && (
                                <span className="ml-1 text-[10px] text-muted-foreground">· {p.itemName}</span>
                              )}
                              {p.kind === "to_tip" && (
                                <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                                  {p.tipContent}
                                </span>
                              )}
                            </label>
                            {p.kind === "retier" && on && (
                              <label className="flex shrink-0 cursor-pointer items-center gap-1 text-[10px] text-muted-foreground">
                                <input
                                  type="checkbox"
                                  checked={promote.has(p.taskTemplateId)}
                                  onChange={() => toggle(p.taskTemplateId, promote, setPromote)}
                                  className="h-3.5 w-3.5 shrink-0 cursor-pointer rounded accent-primary"
                                />
                                keep Essential
                              </label>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )
              })}

              {plan.skippedUserOverridden.length > 0 && (
                <p className="mb-2 text-[11px] text-muted-foreground">
                  {plan.skippedUserOverridden.length} task
                  {plan.skippedUserOverridden.length === 1 ? "" : "s"} left untouched — you either edited them
                  by hand or have completed them before.
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={apply} disabled={phase === "applying" || approvedCount === 0}>
                  {phase === "applying" && <Loader2Icon className="size-3.5 mr-1.5 animate-spin" />}
                  Apply {approvedCount} change{approvedCount === 1 ? "" : "s"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setPlan(null); setPhase("idle") }}
                  disabled={phase === "applying"}
                >
                  Cancel
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
