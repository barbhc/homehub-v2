import { useParams, useNavigate } from "react-router-dom"
import { useCurrentHome } from "@/modules/home"
import { ErrorBoundary } from "@/components/layout"
import { RefinedTaskDetail } from "@/components/home/RefinedTaskDetail"

const BG = "#F3F5F4", SUB = "#6B7280", TEAL = "#1B6B5A"

/**
 * Graceful fallback for the full task view. The detail screen reads live data
 * (instance + template + schedule + members); if any of that ever throws during
 * render we degrade to a calm "couldn't open" panel with a Back action instead
 * of bubbling to the global "Something went wrong" boundary. This keeps
 * /tasks/:id from ever showing the crash page — it always renders the task or
 * this calm fallback.
 */
function TaskDetailFallback({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex min-h-[calc(100vh-48px)] flex-col items-center justify-center gap-3" style={{ background: BG }}>
      <p className="text-[15px]" style={{ color: SUB }}>We couldn&apos;t open this task.</p>
      <button onClick={onBack} className="text-[14px] font-bold" style={{ color: TEAL }}>Go back</button>
    </div>
  )
}

export default function TaskDetail() {
  const { taskInstanceId } = useParams<{ taskInstanceId: string }>()
  const navigate = useNavigate()
  const { home } = useCurrentHome()
  const onBack = () => navigate(-1)
  // One page per task, keyed by it (H4). /tasks/A → /tasks/B — a push tap for
  // another task, the cross-home one included — kept this page mounted, so a
  // re-read of A (after an edit) answering after the move showed A under B's
  // URL, where Mark done acts on B; and until B's read landed the page went on
  // showing A, with A's done and assign state. A new task now starts fresh,
  // and nothing still in flight for the last one can land here. The boundary
  // is keyed too: a crash on one task is not the next task's fallback.
  const taskKey = `${home?.home_id ?? ""}/${taskInstanceId ?? ""}`
  return (
    <div className="relative mx-auto min-h-[calc(100vh-48px)] w-full max-w-[460px] lg:max-w-[960px]">
      <ErrorBoundary key={taskKey} fallback={<TaskDetailFallback onBack={onBack} />}>
        <RefinedTaskDetail
          taskInstanceId={taskInstanceId ?? ""}
          homeId={home?.home_id ?? null}
          onBack={onBack}
        />
      </ErrorBoundary>
    </div>
  )
}
