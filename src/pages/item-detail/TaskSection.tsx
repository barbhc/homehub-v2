import { useState } from "react"
import {
  BookOpenIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ClipboardListIcon,
  Loader2Icon,
  SparklesIcon,
  Trash2Icon,
  WrenchIcon,
} from "lucide-react"
import { SectionCard, EmptyState } from "@/components/layout"
import { Button } from "@/components/ui/button"
import { TaskEditPopover } from "@/components/care/TaskEditPopover"
import { ManualPageSheet } from "@/components/care/ManualPageSheet"
import {
  getTaskTemplatesWithSchedulesByItem,
  deleteTaskTemplate,
  logTaskCompletion,
  updateTaskDiagramPages,
  type TaskTemplateWithSchedule,
} from "@/modules/care"
import {
  reclassifyTaskAsChunk,
  archiveChunk,
  getChunksByItem,
} from "@/modules/knowledge"
import { cn } from "@/lib/utils"
import { useSessionMode } from "@/hooks/useSessionMode"
import type { KnowledgeChunk, ScheduleType } from "@/integrations/types"
import { TierTaskCard } from "./TierTaskCard"
import { CautionCallout } from "@/components/tasks/CautionCallout"
import {
  type TierKey,
  tierDotStyles,
  tierTextStyles,
  glassToggleStyles,
  getTaskGuidance,
} from "./utils"

type ContentTab = "tasks" | "howto" | "troubleshoot"

interface TaskSectionProps {
  tasks: TaskTemplateWithSchedule[]
  homeId: string
  itemId: string
  manualPdfUrl: string | null
  onTasksChange: (tasks: TaskTemplateWithSchedule[]) => void
  onError: (msg: string) => void
  /** Knowledge chunks for How To and Troubleshooting tabs */
  howToChunks?: KnowledgeChunk[]
  troubleshootingChunks?: KnowledgeChunk[]
  onOpenManualPage?: (page: number, chunkId: string) => void
  /** Called after a chunk changes (reclassify) so parent can refresh chunks */
  onChunksChange?: (howTo: KnowledgeChunk[], troubleshooting: KnowledgeChunk[]) => void
  /** Whether this item has at least one parsed manual */
  hasManual?: boolean
  /** Callback to refresh history after marking a task done */
  onHistoryRefresh?: () => void
}

export function TaskSection({
  tasks,
  homeId,
  itemId,
  manualPdfUrl,
  onTasksChange,
  onError,
  howToChunks = [],
  troubleshootingChunks = [],
  onOpenManualPage,
  onChunksChange,
  hasManual = false,
  onHistoryRefresh,
}: TaskSectionProps) {
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null)
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [expandedTierTaskId, setExpandedTierTaskId] = useState<string | null>(null)
  const [filterTier, setFilterTier] = useState<"all" | "essential" | "recommended" | "optional">("all")
  const [expandedTiers, setExpandedTiers] = useState<Set<TierKey>>(new Set())
  const TIER_COLLAPSE_THRESHOLD = 3
  const [manualPageOpen, setManualPageOpen] = useState(false)
  const [manualPageNumber, setManualPageNumber] = useState(1)
  const [manualPageTaskId, setManualPageTaskId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<ContentTab>("tasks")
  const [expandedChunkId, setExpandedChunkId] = useState<string | null>(null)
  const [deletingChunkId, setDeletingChunkId] = useState<string | null>(null)

  const hasHowTo = howToChunks.length > 0
  const hasTroubleshoot = troubleshootingChunks.length > 0
  const showTabs = hasHowTo || hasTroubleshoot

  const session = useSessionMode(tasks)
  const {
    recurringTasksByTier,
    sessionMode,
    sessionPickMode,
    setSessionPickMode,
    activeSessionType,
    selectedTaskIds,
    expandedSessionTaskId,
    setExpandedSessionTaskId,
    sessionTasks,
    checkedTaskIds,
    startSession,
    confirmSession,
    endSession,
    toggleTaskSelection,
    toggleSessionCheck,
    moveSessionTask,
  } = session

  const grouped = recurringTasksByTier

  const handleDeleteTask = async (taskTemplateId: string) => {
    setDeletingTaskId(taskTemplateId)
    const result = await deleteTaskTemplate(homeId, taskTemplateId)
    setDeletingTaskId(null)
    if (result.success) {
      onTasksChange(tasks.filter((t) => t.task_template_id !== taskTemplateId))
    } else {
      onError(`Could not delete task: ${result.error}`)
    }
  }

  const handleDeleteChunk = async (chunkId: string) => {
    const chunk = [...howToChunks, ...troubleshootingChunks].find((c) => c.chunk_id === chunkId)
    if (!chunk) return
    setDeletingChunkId(chunkId)
    const result = await archiveChunk(homeId, chunk.manual_id, chunkId)
    setDeletingChunkId(null)
    if (result.error) {
      onError(`Could not delete: ${result.error.message}`)
    } else {
      const newHowTo = howToChunks.filter((c) => c.chunk_id !== chunkId)
      const newTroubleshoot = troubleshootingChunks.filter((c) => c.chunk_id !== chunkId)
      onChunksChange?.(newHowTo, newTroubleshoot)
    }
  }

  const handleCompleteTask = async (
    taskTemplateId: string,
    completedAt: string,
    notes: string | null
  ) => {
    const result = await logTaskCompletion(homeId, taskTemplateId, itemId, completedAt, notes)
    if (result.error) {
      onError(`Could not log completion: ${result.error.message}`)
    } else {
      onHistoryRefresh?.()
    }
  }

  const handleReclassifyTask = async (
    taskTemplateId: string,
    targetType: "how_to" | "troubleshooting"
  ) => {
    const result = await reclassifyTaskAsChunk(taskTemplateId, homeId, itemId, targetType)
    if (result.error) {
      onError(`Could not reclassify: ${result.error.message}`)
      return
    }
    // Remove task from local state
    onTasksChange(tasks.filter((t) => t.task_template_id !== taskTemplateId))
    // Refresh chunks so the new one shows up in the right tab
    const chunksRes = await getChunksByItem(homeId, itemId)
    if (chunksRes.data) {
      const ht = chunksRes.data.filter((c) => c.chunk_type === "how_to")
      const ts = chunksRes.data.filter((c) => c.chunk_type === "troubleshooting")
      onChunksChange?.(ht, ts)
    }
    // Auto-switch to the target tab so the user sees their reclassified item
    setActiveTab(targetType === "how_to" ? "howto" : "troubleshoot")
  }

  // Determine which tiers to render based on filter
  const tiersToShow: TierKey[] =
    filterTier === "all"
      ? (["essential", "recommended", "optional"] as const).filter(
          (tier) => grouped[tier].length > 0
        )
      : [filterTier]

  // Active tab label + count for the section header
  const tabTitle =
    activeTab === "howto" ? "How To" : activeTab === "troubleshoot" ? "Troubleshoot" : "Tasks"
  const tabCount =
    activeTab === "howto"
      ? howToChunks.length
      : activeTab === "troubleshoot"
        ? troubleshootingChunks.length
        : tasks.length

  return (
    <>
      {/* Task list — chip tabs as primary nav, tier toggle as sub-filter */}
      <SectionCard className="p-4 sm:p-6">
        <div className="mb-3">
          {/* Row 1: primary navigation */}
          {!sessionMode && !sessionPickMode && showTabs && (
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex gap-1.5">
                <ChipTab
                  icon={<ClipboardListIcon className="size-3.5" />}
                  label="Tasks"
                  count={tasks.length}
                  active={activeTab === "tasks"}
                  colorClass="bg-primary/10"
                  onClick={() => setActiveTab("tasks")}
                />
                {hasHowTo && (
                  <ChipTab
                    icon={<BookOpenIcon className="size-3.5" />}
                    label="How To"
                    count={howToChunks.length}
                    active={activeTab === "howto"}
                    colorClass="bg-sky-100"
                    onClick={() => setActiveTab("howto")}
                  />
                )}
                {hasTroubleshoot && (
                  <ChipTab
                    icon={<WrenchIcon className="size-3.5" />}
                    label="Troubleshoot"
                    count={troubleshootingChunks.length}
                    active={activeTab === "troubleshoot"}
                    colorClass="bg-orange-100"
                    onClick={() => setActiveTab("troubleshoot")}
                  />
                )}
              </div>
              {/* Session icons — only on tasks tab */}
              {activeTab === "tasks" && tasks.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="text-muted-foreground hover:text-primary"
                    onClick={() => startSession("cleaning")}
                    title="Start a cleaning session"
                  >
                    <SparklesIcon className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="text-muted-foreground hover:text-primary"
                    onClick={() => startSession("maintenance")}
                    title="Start a maintenance check"
                  >
                    <WrenchIcon className="size-3.5" />
                  </Button>
                </div>
              )}
            </div>
          )}
          {/* Fallback header when no knowledge tabs exist */}
          {!sessionMode && !sessionPickMode && !showTabs && (
            <div className="flex items-center justify-between mb-2.5">
              <h2 className="font-medium">
                Tasks <span className="text-muted-foreground text-sm font-normal">({tasks.length})</span>
              </h2>
              {tasks.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="text-muted-foreground hover:text-primary"
                    onClick={() => startSession("cleaning")}
                    title="Start a cleaning session"
                  >
                    <SparklesIcon className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="text-muted-foreground hover:text-primary"
                    onClick={() => startSession("maintenance")}
                    title="Start a maintenance check"
                  >
                    <WrenchIcon className="size-3.5" />
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Session mode headers */}
          {sessionPickMode && !sessionMode && (
            <div className="flex items-center justify-between">
              <h2 className="font-medium">
                {tabTitle} <span className="text-muted-foreground text-sm font-normal">({tabCount})</span>
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground font-medium">
                  {activeSessionType === "cleaning" ? "Clean Sweep" : "Maintenance Check"}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground"
                  onClick={() => setSessionPickMode(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
          {sessionMode && (
            <div className="flex items-center justify-between">
              <h2 className="font-medium">
                {tabTitle} <span className="text-muted-foreground text-sm font-normal">({tabCount})</span>
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {activeSessionType === "cleaning" ? "Clean Sweep" : "Maintenance Check"}
                </span>
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={endSession}>
                  End session
                </Button>
              </div>
            </div>
          )}

          {/* Row 2: tier toggle — only visible on Tasks tab, not in session mode */}
          {tasks.length > 0 && !sessionMode && !sessionPickMode && activeTab === "tasks" && (
            <div className={cn(glassToggleStyles.container)}>
              {(["all", "essential", "recommended", "optional"] as const).map((tier) => (
                <button
                  key={tier}
                  type="button"
                  onClick={() => setFilterTier(tier)}
                  className={cn(
                    glassToggleStyles.item,
                    filterTier === tier && glassToggleStyles.active
                  )}
                  title={`Show ${tier === "all" ? "all" : tier} tasks`}
                >
                  {tier === "all" ? "All" : tier.charAt(0).toUpperCase() + tier.slice(1)}
                  {tier === "all" ? ` ${tasks.length}` : ` ${grouped[tier]?.length ?? 0}`}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── How To tab ── */}
        {activeTab === "howto" && hasHowTo && !sessionMode && !sessionPickMode && (
          <KnowledgeList
            chunks={howToChunks}
            accentClass="from-sky-400 to-sky-500"
            tintClass="sky"
            expandedId={expandedChunkId}
            onToggle={(id) => setExpandedChunkId(expandedChunkId === id ? null : id)}
            onOpenManualPage={onOpenManualPage}
            onDelete={handleDeleteChunk}
            deletingId={deletingChunkId}
          />
        )}

        {/* ── Troubleshoot tab ── */}
        {activeTab === "troubleshoot" && hasTroubleshoot && !sessionMode && !sessionPickMode && (
          <KnowledgeList
            chunks={troubleshootingChunks}
            accentClass="from-orange-400 to-orange-500"
            tintClass="orange"
            expandedId={expandedChunkId}
            onToggle={(id) => setExpandedChunkId(expandedChunkId === id ? null : id)}
            onOpenManualPage={onOpenManualPage}
            onDelete={handleDeleteChunk}
            deletingId={deletingChunkId}
          />
        )}

        {/* Clean Sweep — task picker */}
        {sessionPickMode && !sessionMode && (
          <div>
            <p className="text-sm text-muted-foreground mb-3">
              {activeSessionType === "cleaning"
                ? "Cleaning tasks for today."
                : "Maintenance and safety tasks."}
            </p>
            <ul className="space-y-2">
              {(["essential", "recommended", "optional"] as const).map((tier) => {
                const careTypes: Array<"cleaning" | "maintenance" | "mixed"> =
                  activeSessionType === "cleaning"
                    ? ["cleaning", "mixed"]
                    : ["maintenance", "mixed"]
                const list = grouped[tier].filter((t) =>
                  careTypes.includes(t.care_type ?? "maintenance")
                )
                if (list.length === 0) return null
                return (
                  <li key={tier}>
                    <p className="text-[10px] font-bold uppercase tracking-[0.09em] text-muted-foreground mb-1.5 px-1">
                      {tier}
                    </p>
                    <ul className="space-y-1.5">
                      {list.map((t) => {
                        const checked = selectedTaskIds.has(t.task_template_id)
                        return (
                          <li
                            key={t.task_template_id}
                            className={cn(
                              "flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors",
                              checked
                                ? "border-primary/40 bg-primary/5"
                                : "border-border bg-card opacity-50"
                            )}
                            onClick={() => toggleTaskSelection(t.task_template_id)}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              readOnly
                              className="shrink-0 h-4 w-4 rounded accent-primary pointer-events-none"
                            />
                            <span className="text-sm font-medium flex-1">{t.title}</span>
                            {t.estimated_minutes != null && t.estimated_minutes > 0 && (
                              <span className="text-xs text-muted-foreground shrink-0">
                                {t.estimated_minutes} min
                              </span>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  </li>
                )
              })}
            </ul>
            <div className="flex items-center gap-2 mt-4">
              <Button
                onClick={confirmSession}
                disabled={selectedTaskIds.size === 0}
                className="flex-1"
              >
                Start ({selectedTaskIds.size} task{selectedTaskIds.size === 1 ? "" : "s"})
              </Button>
              <Button variant="ghost" onClick={() => setSessionPickMode(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Session mode — checklist with expandable steps */}
        {sessionMode && (
          <ul className="space-y-2">
            {sessionTasks.map((t, index) => {
              const checked = checkedTaskIds.has(t.task_template_id)
              const isExpanded = expandedSessionTaskId === t.task_template_id
              const { steps, cautions } = getTaskGuidance(t)
              const hasGuidance = steps.length > 0 || cautions.length > 0

              return (
                <li
                  key={t.task_template_id}
                  className={cn(
                    "rounded-md border bg-card transition-opacity",
                    checked && "opacity-50"
                  )}
                >
                  <div className="flex items-center gap-3 p-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSessionCheck(t.task_template_id)}
                      className="shrink-0 h-4 w-4 rounded accent-primary cursor-pointer"
                      aria-label={`Mark ${t.title} done`}
                    />
                    <span
                      className={cn(
                        "flex-1 min-w-0 text-sm cursor-pointer",
                        checked && "line-through text-muted-foreground"
                      )}
                      onClick={() =>
                        setExpandedSessionTaskId((prev) =>
                          prev === t.task_template_id ? null : t.task_template_id
                        )
                      }
                    >
                      {t.title}
                    </span>
                    {hasGuidance && (
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedSessionTaskId((prev) =>
                            prev === t.task_template_id ? null : t.task_template_id
                          )
                        }
                        className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                        aria-label={isExpanded ? "Collapse steps" : "Show steps"}
                      >
                        <ChevronDownIcon
                          className={cn("size-4 transition-transform", isExpanded && "rotate-180")}
                        />
                      </button>
                    )}
                    <div className="flex flex-col gap-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => moveSessionTask(index, -1)}
                        disabled={index === 0}
                        className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-20"
                        aria-label="Move up"
                      >
                        <ChevronUpIcon className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveSessionTask(index, 1)}
                        disabled={index === sessionTasks.length - 1}
                        className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-20"
                        aria-label="Move down"
                      >
                        <ChevronDownIcon className="size-4" />
                      </button>
                    </div>
                  </div>

                  {hasGuidance && (
                    <div className={cn("border-t border-border/50 px-4 py-3 space-y-2.5", !isExpanded && "hidden")}>
                      {steps.map((step, i) => (
                        <div key={i} className="flex gap-3 items-start">
                          <span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center mt-0.5">
                            {i + 1}
                          </span>
                          <p className="text-sm text-muted-foreground leading-relaxed">{step}</p>
                        </div>
                      ))}
                      <CautionCallout cautions={cautions} />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {/* Normal tier-grouped task list */}
        {activeTab === "tasks" && !sessionPickMode && !sessionMode && tasks.length === 0 ? (
          <EmptyState
            title="No care jobs yet"
            teach="Add this item's manual and Homehub will pull out what the manufacturer says to do, and how often. You can also write a job yourself."
          />
        ) : activeTab === "tasks" && !sessionPickMode && !sessionMode ? (
          <div className="bg-white/25 rounded-2xl p-3 sm:p-4 -mx-2">
            <div className="space-y-4">
              {tiersToShow.map((tier) => {
                const list = grouped[tier]
                if (list.length === 0) return null
                const isTierExpanded = expandedTiers.has(tier)
                // When "all" filter is active and the tier overflows, collapse
                // to the top N until the user opts in. When the user filters
                // to a single tier, show everything.
                const shouldCollapse =
                  filterTier === "all" &&
                  !isTierExpanded &&
                  list.length > TIER_COLLAPSE_THRESHOLD
                const visibleList = shouldCollapse
                  ? list.slice(0, TIER_COLLAPSE_THRESHOLD)
                  : list
                const hiddenCount = list.length - visibleList.length
                return (
                  <div key={tier} id={`task-tier-${tier}`}>
                    <div className="flex items-center gap-1.5 mb-1.5 px-1">
                      <span
                        className={cn(
                          "size-1.5 rounded-full shrink-0",
                          tierDotStyles[tier]
                        )}
                      />
                      <span
                        className={cn(
                          "text-[10px] font-semibold uppercase tracking-widest",
                          tierTextStyles[tier]
                        )}
                      >
                        {tier}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-medium">
                        {list.length}
                      </span>
                    </div>
                    <ul className="space-y-2">
                      {visibleList.map((t) => (
                        <TierTaskCard
                          key={t.task_template_id}
                          task={t}
                          tier={tier}
                          isExpanded={expandedTierTaskId === t.task_template_id}
                          isDeleting={deletingTaskId === t.task_template_id}
                          manualPdfUrl={manualPdfUrl}
                          onToggleExpand={() =>
                            setExpandedTierTaskId((prev) =>
                              prev === t.task_template_id ? null : t.task_template_id
                            )
                          }
                          onEdit={() => setEditingTaskId(t.task_template_id)}
                          onDelete={() => handleDeleteTask(t.task_template_id)}
                          onOpenManualPage={(page) => {
                            setManualPageNumber(page)
                            setManualPageTaskId(t.task_template_id)
                            setManualPageOpen(true)
                          }}
                          onComplete={(completedAt, notes) =>
                            handleCompleteTask(t.task_template_id, completedAt, notes)
                          }
                          onReclassify={(targetType) =>
                            handleReclassifyTask(t.task_template_id, targetType)
                          }
                          hasManual={hasManual}
                        />
                      ))}
                    </ul>
                    {(hiddenCount > 0 || (isTierExpanded && list.length > TIER_COLLAPSE_THRESHOLD)) && (
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedTiers((prev) => {
                            const next = new Set(prev)
                            if (next.has(tier)) next.delete(tier)
                            else next.add(tier)
                            return next
                          })
                        }
                        className="mt-2 ml-1 text-xs font-medium text-primary hover:underline"
                      >
                        {hiddenCount > 0
                          ? `See all ${list.length} tasks`
                          : "Show less"}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}

        {editingTaskId && (() => {
          const editTask = tasks.find((t) => t.task_template_id === editingTaskId)
          if (!editTask) return null
          const scheduleRule = editTask.schedule_rule?.[0]
          return (
            <TaskEditPopover
              open={true}
              onOpenChange={(open) => { if (!open) setEditingTaskId(null) }}
              homeId={homeId}
              taskTemplateId={editingTaskId}
              currentTier={editTask.priority_tier}
              currentSchedule={{
                scheduleType: (scheduleRule?.schedule_type ?? "as_needed") as ScheduleType,
                intervalDays: scheduleRule?.interval_days ?? undefined,
              }}
              currentEstimatedMinutes={editTask.estimated_minutes}
              currentRiskLevel={editTask.risk_level}
              onUpdated={async () => {
                setEditingTaskId(null)
                const res = await getTaskTemplatesWithSchedulesByItem(homeId, itemId)
                if (res.data) onTasksChange(res.data)
              }}
            />
          )
        })()}
      </SectionCard>

      {manualPdfUrl && (
        <ManualPageSheet
          open={manualPageOpen}
          onOpenChange={setManualPageOpen}
          pdfUrl={manualPdfUrl}
          pageNumber={manualPageNumber}
          onSetPage={manualPageTaskId ? async (newPage) => {
            const result = await updateTaskDiagramPages(homeId, manualPageTaskId, [
              { page: newPage, caption: "" },
            ])
            if (result.error) {
              onError(result.error.message)
              return
            }
            // Refresh tasks to pick up the new metadata
            const refreshResult = await getTaskTemplatesWithSchedulesByItem(homeId, itemId)
            if (refreshResult.data) onTasksChange(refreshResult.data)
          } : undefined}
        />
      )}
    </>
  )
}

/* ── ChipTab: icon-only on mobile when inactive, full label when active or on desktop ── */
function ChipTab({
  icon,
  label,
  count,
  active,
  colorClass,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  count: number
  active: boolean
  colorClass: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 text-xs font-semibold rounded-lg border transition-all duration-200",
        active
          ? "border-primary bg-primary/[0.06] text-primary shadow-sm px-3 py-1.5"
          : "border-white/60 bg-white/50 text-muted-foreground hover:border-primary/20 hover:bg-white/70 px-2 py-1.5 sm:px-3"
      )}
    >
      <span className={cn("size-5 rounded-md flex items-center justify-center shrink-0", colorClass)}>
        {icon}
      </span>
      {/* On mobile: show label only when active. On desktop: always show. */}
      <span className={cn(active ? "inline" : "hidden sm:inline")}>{label}</span>
      <span
        className={cn(
          "text-[10px] font-bold px-1.5 rounded-full",
          active
            ? "bg-primary/10 text-primary"
            : "bg-black/5 text-muted-foreground",
          active ? "inline" : "hidden sm:inline"
        )}
      >
        {count}
      </span>
    </button>
  )
}

/* ── KnowledgeList: renders How To or Troubleshooting chunks inline ── */

/** Break a long prose block into readable paragraphs at sentence boundaries. */
function formatProse(text: string): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  const paragraphs = trimmed.split(/\n\s*\n/).filter(Boolean)
  if (paragraphs.length > 1) return paragraphs.map((p) => p.trim())
  const sentences = trimmed.split(/(?<=[.!?])\s+(?=[A-Z])/)
  if (sentences.length <= 3) return [trimmed]
  const groups: string[] = []
  for (let i = 0; i < sentences.length; i += 2) {
    groups.push(sentences.slice(i, i + 2).join(" "))
  }
  return groups
}

function parseNumberedSteps(content: string): string[] | null {
  const t = content.trim()
  if (!t) return null
  const lineSteps: string[] = []
  for (const line of t.split(/\n/)) {
    const m = line.trim().match(/^(\d+)[.)]\s+(.+)$/)
    if (m) lineSteps.push(m[2].trim())
  }
  if (lineSteps.length >= 2) return lineSteps
  const segments = t.split(/(?:^|\s+)(?=\d+[.)]\s)/)
    .map((s) => s.replace(/^\d+[.)]\s+/, "").trim())
    .filter(Boolean)
  if (segments.length >= 2) return segments
  return null
}

function parseStructured(content: string): { symptom?: string; cause?: string; fix?: string } | null {
  const symptomMatch = content.match(/Symptom:\s*([^.]+\.?)/i)
  const causeMatch = content.match(/Cause:\s*([^.]+\.?)/i)
  const fixMatch = content.match(/Fix:\s*([^.]+\.?)/i)
  if (symptomMatch && causeMatch && fixMatch) {
    return { symptom: symptomMatch[1].trim(), cause: causeMatch[1].trim(), fix: fixMatch[1].trim() }
  }
  return null
}

function KnowledgeList({
  chunks,
  accentClass,
  tintClass,
  expandedId,
  onToggle,
  onOpenManualPage,
  onDelete,
  deletingId,
}: {
  chunks: KnowledgeChunk[]
  accentClass: string
  tintClass: "sky" | "orange"
  expandedId: string | null
  onToggle: (id: string) => void
  onOpenManualPage?: (page: number, chunkId: string) => void
  onDelete?: (chunkId: string) => void
  deletingId?: string | null
}) {
  if (chunks.length === 0) return null

  return (
    <div className="space-y-2">
      {chunks.map((chunk) => {
        const sourcePages = chunk.source_pages ?? []
        const steps = parseNumberedSteps(chunk.content)
        const structured = tintClass === "orange" ? parseStructured(chunk.content) : null
        const isExpanded = expandedId === chunk.chunk_id
        const stepCount = steps?.length ?? 0

        return (
          <div
            key={chunk.chunk_id}
            className={cn(
              "bg-white/55 backdrop-blur-sm border border-white/70 rounded-[14px] transition-all duration-200 overflow-hidden",
              "hover:bg-white/75 hover:-translate-y-px hover:shadow-md",
              isExpanded && "bg-white/80 shadow-md"
            )}
          >
            <div className="flex">
              <div className={cn("w-1 rounded-full self-stretch shrink-0 my-2 ml-2 bg-gradient-to-b", accentClass)} />
              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-2 px-3 pt-3 pb-1">
                  <button
                    type="button"
                    className="text-[13px] sm:text-sm font-semibold flex-1 min-w-0 text-left leading-snug"
                    onClick={() => onToggle(chunk.chunk_id)}
                  >
                    {(chunk.title ?? "Guide").replace(/^Troubleshooting\s*[—–-]\s*/i, "")}
                  </button>
                  {onDelete && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onDelete(chunk.chunk_id) }}
                      disabled={deletingId === chunk.chunk_id}
                      className="h-11 w-11 md:h-6 md:w-6 p-0 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors shrink-0 -mt-2 md:mt-px"
                      aria-label="Delete chunk"
                    >
                      {deletingId === chunk.chunk_id
                        ? <Loader2Icon className="size-3 animate-spin" />
                        : <Trash2Icon className="size-3" />}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onToggle(chunk.chunk_id)}
                    className="h-11 w-11 md:h-6 md:w-6 p-0 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors shrink-0 -mt-2 md:mt-px -mr-2 md:mr-0"
                  >
                    <ChevronDownIcon className={cn("size-4 transition-transform", isExpanded && "rotate-180")} />
                  </button>
                </div>
                <div className="flex items-center gap-x-3 px-3 pb-2.5">
                  {stepCount > 0 && (
                    <span className="text-[11px] text-muted-foreground">{stepCount} step{stepCount === 1 ? "" : "s"}</span>
                  )}
                  {sourcePages.length > 0 && (
                    <span className="text-[11px] text-muted-foreground">p. {sourcePages.join(", ")}</span>
                  )}
                </div>
                {isExpanded && (
                  <div className="border-t border-border/30 px-4 py-3 space-y-3">
                    {structured ? (
                      <div className="space-y-2 text-sm leading-relaxed">
                        {(["symptom", "cause", "fix"] as const).map((key) => (
                          <div key={key} className="flex gap-2 items-start">
                            <span className={cn("shrink-0 text-[10px] font-bold uppercase tracking-wider mt-0.5 w-16", tintClass === "orange" ? "text-orange-600" : "text-sky-600")}>
                              {key.charAt(0).toUpperCase() + key.slice(1)}
                            </span>
                            <p className="text-muted-foreground">{structured[key]}</p>
                          </div>
                        ))}
                      </div>
                    ) : steps ? (
                      <div className="space-y-2.5">
                        {steps.map((text, i) => (
                          <div key={i} className="flex gap-3 items-start">
                            <span className={cn(
                              "shrink-0 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center mt-0.5",
                              tintClass === "sky" ? "bg-sky-500/10 text-sky-600" : "bg-orange-500/10 text-orange-600"
                            )}>
                              {i + 1}
                            </span>
                            <p className="text-sm text-muted-foreground leading-relaxed">{text}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {formatProse(chunk.content).map((para, i) => (
                          <p key={i} className="text-sm text-muted-foreground leading-relaxed">{para}</p>
                        ))}
                      </div>
                    )}
                    {sourcePages.length > 0 && onOpenManualPage && (
                      <button
                        type="button"
                        onClick={() => onOpenManualPage(sourcePages[0], chunk.chunk_id)}
                        className={cn(
                          "flex items-center gap-2 w-full rounded-lg px-3 py-2 transition-colors",
                          tintClass === "sky" ? "bg-sky-500/5 hover:bg-sky-500/10" : "bg-orange-500/5 hover:bg-orange-500/10"
                        )}
                      >
                        <BookOpenIcon className={cn("size-4", tintClass === "sky" ? "text-sky-500" : "text-orange-500")} />
                        <span className={cn("text-sm font-medium", tintClass === "sky" ? "text-sky-600" : "text-orange-600")}>
                          View in manual — page {sourcePages[0]}
                        </span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
