import { useState } from "react"
import { Loader2Icon, SparklesIcon, AlertCircleIcon, CheckCircle2Icon, DownloadIcon } from "lucide-react"
import { SectionCard } from "@/components/layout"
import { CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { collection, getDocs } from "firebase/firestore"
import { db, callable } from "@/integrations/firebase"
import { cn } from "@/lib/utils"
import { TaskCleanupSweep } from "./TaskCleanupSweep"

// ---------------------------------------------------------------------------
// CSV export helpers
// ---------------------------------------------------------------------------

interface ExportRow {
  task_template_id: string
  title: string
  description: string | null
  instructions_override: string | null
  care_type: string
  is_active: boolean
  justification: string | null
  item_unit: { display_name: string } | { display_name: string }[] | null
  schedule_rule: { schedule_type: string; interval_days: number | null }[]
}

const EXPORT_HEADERS = [
  "task_template_id",
  "item",
  "title",
  "description",
  "instructions",
  "current_care_type",
  "current_schedule_type",
  "current_interval_days",
  "current_is_active",
  "justification",
  "your_notes",
  "your_correct_care_type",
  "your_correct_schedule_type",
  "your_correct_is_active",
] as const

/** Escape a single cell for CSV per RFC 4180 — wrap in quotes, double internal quotes. */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '""'
  const str = String(value)
  return `"${str.replace(/"/g, '""')}"`
}

function formatTasksAsCsv(rows: ExportRow[]): string {
  const headerLine = EXPORT_HEADERS.map(csvCell).join(",")
  const dataLines = rows.map((r) => {
    const item = Array.isArray(r.item_unit)
      ? r.item_unit[0]?.display_name ?? ""
      : r.item_unit?.display_name ?? ""
    const sched = r.schedule_rule?.[0] ?? null
    return [
      r.task_template_id,
      item,
      r.title,
      r.description ?? "",
      r.instructions_override ?? "",
      r.care_type,
      sched?.schedule_type ?? "",
      sched?.interval_days ?? "",
      r.is_active ? "true" : "false",
      r.justification ?? "",
      "", // your_notes
      "", // your_correct_care_type
      "", // your_correct_schedule_type
      "", // your_correct_is_active
    ].map(csvCell).join(",")
  })
  return [headerLine, ...dataLines].join("\n")
}

function downloadCsv(filename: string, csv: string) {
  // Prepend BOM so Excel opens UTF-8 cleanly on Windows.
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  // Defer revoke so the click finishes before the URL is freed.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

interface ClassifierResult {
  task_template_id: string
  title: string
  item_name: string | null
  current_schedule_type: string | null
  proposed_schedule_type: string | null
  current_care_type: "cleaning" | "maintenance" | "mixed"
  proposed_care_type: "cleaning" | "maintenance" | "mixed"
  current_symptom_tags: string[]
  proposed_symptom_tags: string[]
  justification: string
  care_change: boolean
  schedule_change: boolean
  symptom_tags_change: boolean
  /** True if classifier flagged the row as operational reference (not a real recurring task). */
  proposed_is_reference: boolean
  change: boolean
}

/**
 * Schedules in this set route the task to the Habits & Reminders surface
 * on the item detail page (Phase 3) — they don't enter the recurring
 * task feed regardless of care_type. Surfaced visually in the dry-run so
 * the user can spot mis-classified cadences before applying.
 */
const HABIT_SCHEDULES = new Set(["after_each_use", "as_needed"])

interface ClassifierResponse {
  ok: boolean
  dry_run: boolean
  total: number
  changes: number
  /** Number of rows where care_type would change. */
  care_changes?: number
  /** Number of rows where schedule_type would change. */
  schedule_changes?: number
  /** Number of rows where symptom_tags would change. */
  symptom_tag_changes?: number
  /** Number of rows that would be deactivated as operational reference content. */
  reference_count?: number
  writes: number
  results: ClassifierResult[]
  error?: string
}

const classifyExistingTasksCallable = callable<
  { homeId: string; dryRun: boolean; results?: ClassifierResult[] },
  ClassifierResponse
>("classifyExistingTasks")

interface Props {
  homeId: string
}

/**
 * Admin tools surfaced in Settings for one-shot data operations the user
 * triggers manually. Currently hosts the cleaning/maintenance backfill
 * (Phase 2 of the classifier work). The dry-run is shown before any writes
 * happen — the user reviews proposed changes before approving.
 */
export function AdminToolsSection({ homeId }: Props) {
  const [running, setRunning] = useState<"idle" | "dry-run" | "commit">("idle")
  const [report, setReport] = useState<ClassifierResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Export state
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const exportTasksCsv = async () => {
    setExporting(true)
    setExportError(null)
    try {
      // Pull every task_template for this home — active and inactive — so the
      // user can see the full corpus including rows the classifier deactivated.
      // The schedule is inlined on the template; item display_name joins via an
      // items map (both single reads on the home's subcollections).
      const [tplSnap, itemSnap] = await Promise.all([
        getDocs(collection(db, `homes/${homeId}/taskTemplates`)),
        getDocs(collection(db, `homes/${homeId}/items`)),
      ])
      const nameById = new Map<string, string>()
      itemSnap.docs.forEach((d) => nameById.set(d.id, (d.data().displayName as string) ?? ""))
      const rows: ExportRow[] = tplSnap.docs
        .filter((d) => d.data().deletedAt == null)
        .map((d) => {
          const x = d.data()
          const sched = x.schedule as { scheduleType?: string; intervalDays?: number | null } | null
          return {
            task_template_id: d.id,
            title: (x.title as string) ?? "",
            description: (x.description as string | null) ?? null,
            instructions_override: (x.instructionsOverride as string | null) ?? null,
            care_type: (x.careType as string) ?? "",
            is_active: (x.isActive as boolean) ?? true,
            justification: (x.justification as string | null) ?? null,
            item_unit: x.itemUnitId ? { display_name: nameById.get(x.itemUnitId as string) ?? "" } : null,
            schedule_rule: sched?.scheduleType
              ? [{ schedule_type: sched.scheduleType, interval_days: sched.intervalDays ?? null }]
              : [],
          }
        })
        .sort((a, b) => a.title.localeCompare(b.title))
      if (rows.length === 0) {
        setExportError("No tasks to export.")
        return
      }
      const csv = formatTasksAsCsv(rows)
      const today = new Date().toISOString().split("T")[0]
      downloadCsv(`homehub-tasks-${today}.csv`, csv)
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Unexpected error during export")
    } finally {
      setExporting(false)
    }
  }

  const runClassifier = async (dryRun: boolean) => {
    setRunning(dryRun ? "dry-run" : "commit")
    setError(null)
    if (dryRun) setReport(null)
    try {
      // On apply, pass the already-classified dry-run results back to the edge
      // function so it can skip the Claude API phase entirely. This avoids
      // re-running classification (which could hit rate limits or transient
      // errors) and makes apply significantly faster.
      const body: { homeId: string; dryRun: boolean; results?: ClassifierResult[] } = {
        homeId,
        dryRun,
      }
      if (!dryRun && report?.results) {
        body.results = report.results
      }
      const data = await classifyExistingTasksCallable(body)
      if (!data?.ok) {
        setError(data?.error ?? "Classifier returned an error")
        return
      }
      setReport(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error")
    } finally {
      setRunning("idle")
    }
  }

  return (
    <SectionCard className="mt-6">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <SparklesIcon className="size-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Admin tools</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          One-off data operations. Run the dry-run first to review proposed changes before applying.
        </p>

        <div className="space-y-3">
          {/* ── Export tasks to CSV ─────────────────────────────────────────────── */}
          <div className="pb-3 border-b border-border">
            <p className="text-sm font-medium text-foreground">Export tasks for review</p>
            <p className="text-xs text-muted-foreground mt-0.5 mb-2">
              Download every task in your home as CSV — including the current classification
              and four blank columns for your audit notes (<code className="text-[11px]">your_notes</code>,
              <code className="text-[11px] mx-0.5">your_correct_care_type</code>,
              <code className="text-[11px]">your_correct_schedule_type</code>,
              <code className="text-[11px] ml-0.5">your_correct_is_active</code>).
              Audit at your pace; we can build a re-import tool later if you mark up many corrections.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={exportTasksCsv}
              disabled={exporting}
            >
              {exporting
                ? <Loader2Icon className="size-3.5 mr-1.5 animate-spin" />
                : <DownloadIcon className="size-3.5 mr-1.5" />}
              Export tasks (CSV)
            </Button>
            {exportError && (
              <div className="mt-2 flex items-start gap-2 p-2 rounded-lg bg-destructive/10 text-destructive">
                <AlertCircleIcon className="size-4 shrink-0 mt-0.5" />
                <p className="text-xs">{exportError}</p>
              </div>
            )}
          </div>

          {/* ── Deterministic task-cleanup sweep (taxonomy + dedupe) ───────────── */}
          <div className="pb-3 border-b border-border">
            <TaskCleanupSweep homeId={homeId} />
          </div>

          {/* ── Classify pending tasks ──────────────────────────────────────────── */}
          <div>
            <p className="text-sm font-medium text-foreground">Classify pending tasks</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Backfills <code className="text-[11px]">justification</code> on every task that doesn't yet have one,
              and re-classifies <code className="text-[11px]">care_type</code> + <code className="text-[11px]">schedule_type</code> using
              the consequence-based rubric. Also flags operational how-tos as <code className="text-[11px]">is_reference</code>{" "}
              (deactivated, not deleted). Skips tasks the user has manually overridden.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => runClassifier(true)}
              disabled={running !== "idle"}
            >
              {running === "dry-run" ? <Loader2Icon className="size-3.5 mr-1.5 animate-spin" /> : null}
              Dry run
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => runClassifier(false)}
              disabled={running !== "idle" || !report || report.dry_run === false}
            >
              {running === "commit" ? <Loader2Icon className="size-3.5 mr-1.5 animate-spin" /> : null}
              Apply changes
            </Button>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive">
              <AlertCircleIcon className="size-4 shrink-0 mt-0.5" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          {report && (
            <div className="space-y-3">
              <div className={cn(
                "flex items-start gap-2 p-3 rounded-lg",
                report.dry_run
                  ? "bg-muted text-foreground"
                  : "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
              )}>
                {report.dry_run ? null : <CheckCircle2Icon className="size-4 shrink-0 mt-0.5" />}
                <div className="text-sm">
                  <p className="font-medium">
                    {report.dry_run
                      ? `Dry run — ${report.total} tasks classified, ${report.changes} would change.`
                      : `Applied — wrote ${report.writes} of ${report.total} rows.`}
                  </p>
                  {(report.care_changes != null || report.schedule_changes != null || report.symptom_tag_changes != null || report.reference_count != null) && (
                    <p className="text-xs mt-1 text-muted-foreground">
                      {report.care_changes ?? 0} care · {report.schedule_changes ?? 0} schedule · {report.symptom_tag_changes ?? 0} tags · {report.reference_count ?? 0} deactivate
                    </p>
                  )}
                  {report.dry_run && report.total > 0 && (
                    <p className="text-xs mt-1 text-muted-foreground">
                      Review the table below. Click <strong>Apply changes</strong> to write.
                    </p>
                  )}
                </div>
              </div>

              {report.results.length > 0 && (
                <div className="border border-border rounded-lg overflow-hidden">
                  <div className="max-h-[480px] overflow-x-auto overflow-y-auto">
                    <table className="w-full text-xs min-w-[840px]">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr>
                          <th className="text-left p-2 font-semibold">Task</th>
                          <th className="text-left p-2 font-semibold">Item</th>
                          <th className="text-left p-2 font-semibold">Schedule</th>
                          <th className="text-left p-2 font-semibold">Care</th>
                          <th className="text-left p-2 font-semibold">Why this matters</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.results.map((r) => {
                          const proposedIsHabit = r.proposed_schedule_type
                            ? HABIT_SCHEDULES.has(r.proposed_schedule_type)
                            : false
                          const currentIsHabit = r.current_schedule_type
                            ? HABIT_SCHEDULES.has(r.current_schedule_type)
                            : false
                          return (
                          <tr
                            key={r.task_template_id}
                            className={cn(
                              "border-t border-border",
                              r.proposed_is_reference && "bg-red-50/60 dark:bg-red-950/30",
                              !r.proposed_is_reference && r.change && "bg-amber-50/40 dark:bg-amber-950/20"
                            )}
                          >
                            <td className="p-2 font-medium align-top">
                              <div>{r.title}</div>
                              {(r.proposed_symptom_tags.length > 0 || r.symptom_tags_change) && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {r.proposed_symptom_tags.map((tag) => (
                                    <span
                                      key={tag}
                                      className={cn(
                                        "inline-flex items-center px-1 py-px rounded text-[9px] font-medium border",
                                        r.symptom_tags_change
                                          ? "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-800"
                                          : "bg-muted text-muted-foreground border-border"
                                      )}
                                    >
                                      {tag}
                                    </span>
                                  ))}
                                  {r.symptom_tags_change && r.proposed_symptom_tags.length === 0 && (
                                    <span className="text-[9px] text-muted-foreground italic">tags cleared</span>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="p-2 text-muted-foreground align-top">{r.item_name ?? "—"}</td>
                            <td className="p-2 align-top whitespace-nowrap">
                              {r.schedule_change ? (
                                <span className="flex items-center gap-1">
                                  <span className="text-muted-foreground line-through text-[10px]">
                                    {r.current_schedule_type ?? "—"}
                                  </span>
                                  <span className="text-muted-foreground">→</span>
                                  <span className={cn(
                                    "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border",
                                    proposedIsHabit
                                      ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800"
                                      : "bg-muted text-foreground border-border"
                                  )}>
                                    {r.proposed_schedule_type}
                                    {proposedIsHabit ? " · habit" : ""}
                                  </span>
                                </span>
                              ) : (
                                <span className={cn(
                                  "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border",
                                  currentIsHabit
                                    ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800"
                                    : "bg-muted text-muted-foreground border-border"
                                )}>
                                  {r.current_schedule_type ?? "—"}
                                  {currentIsHabit ? " · habit" : ""}
                                </span>
                              )}
                            </td>
                            <td className="p-2 align-top whitespace-nowrap">
                              {r.proposed_is_reference ? (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border bg-red-100 text-red-800 border-red-300 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800">
                                  Deactivate
                                </span>
                              ) : r.care_change ? (
                                <span>
                                  <span className="text-muted-foreground">{r.current_care_type}</span>
                                  {" → "}
                                  <span className="font-semibold">{r.proposed_care_type}</span>
                                </span>
                              ) : (
                                <span className="text-muted-foreground">{r.current_care_type}</span>
                              )}
                            </td>
                            <td className="p-2 text-muted-foreground align-top">{r.justification}</td>
                          </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </SectionCard>
  )
}
