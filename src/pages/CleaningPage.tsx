import { useEffect, useState } from "react"
import { PageContainer, PageHeader, SectionCard, EmptyState } from "@/components/layout"
import { Button } from "@/components/ui/button"
import { useCurrentHome } from "@/modules/home"
import { getRooms } from "@/modules/home"
import { getItemUnits } from "@/modules/items"
import { getTaskInstances } from "@/modules/care"
import { supabase } from "@/integrations/shim/client"
import type { CleaningSession, Room, ItemUnit } from "@/integrations/types"
import type { TaskInstanceWithDetails } from "@/modules/care"
import { Check } from "lucide-react"

type Step = "select_room" | "select_tasks" | "check_off" | "summary"

export default function CleaningPage() {
  const { home } = useCurrentHome()
  const [step, setStep] = useState<Step>("select_room")
  const [rooms, setRooms] = useState<Room[]>([])
  const [items, setItems] = useState<ItemUnit[]>([])
  const [instances, setInstances] = useState<TaskInstanceWithDetails[]>([])
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null)
  const [selectedInstanceIds, setSelectedInstanceIds] = useState<Set<string>>(new Set())
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set())
  const [, setSession] = useState<CleaningSession | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!home) return
    getRooms(home.home_id).then((r) => setRooms(r.data ?? []))
    getItemUnits(home.home_id).then((i) => setItems(i.data ?? []))
    getTaskInstances(home.home_id, { status: ["scheduled"] }).then((t) => setInstances(t.data ?? []))
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- home?.home_id is sufficient
  }, [home?.home_id])

  const roomItems = selectedRoomId ? items.filter((i) => i.room_id === selectedRoomId) : []
  const roomInstances = selectedRoomId
    ? instances.filter((i) => roomItems.some((it) => it.item_unit_id === i.item_unit_id))
    : []

  const startSession = async () => {
    if (!home) return
    const { data } = await supabase
      .from("cleaning_session")
      .insert({ home_id: home.home_id, room_id: selectedRoomId })
      .select()
      .single()
    if (data) setSession(data as CleaningSession)
  }

  const handleNext = () => {
    if (step === "select_room") {
      startSession()
      setStep("select_tasks")
    } else if (step === "select_tasks") setStep("check_off")
    else if (step === "check_off") setStep("summary")
  }

  const toggleTask = (id: string) => {
    setSelectedInstanceIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const markDone = (id: string) => setCompletedIds((prev) => new Set(prev).add(id))

  if (!home) return null

  return (
    <PageContainer>
      <PageHeader title="Cleaning Session" subtitle="Pick a room, select tasks, check them off." />
      {loading && <p className="text-muted-foreground">Loading...</p>}
      {!loading && step === "select_room" && (
        <SectionCard className="p-6">
          <h2 className="font-medium mb-3">Select room</h2>
          {rooms.length === 0 ? (
            <EmptyState title="No rooms yet" description="Add rooms in settings first." />
          ) : (
            <div className="flex flex-wrap gap-2">
              {rooms.map((r) => (
                <Button
                  key={r.room_id}
                  variant={selectedRoomId === r.room_id ? "default" : "outline"}
                  onClick={() => setSelectedRoomId(r.room_id)}
                >
                  {r.name}
                </Button>
              ))}
            </div>
          )}
          <Button className="mt-4" onClick={handleNext} disabled={!selectedRoomId}>
            Next
          </Button>
        </SectionCard>
      )}
      {!loading && step === "select_tasks" && (
        <SectionCard className="p-6">
          <h2 className="font-medium mb-3">Select tasks</h2>
          {roomInstances.length === 0 ? (
            <EmptyState title="No tasks in this room" />
          ) : (
            <div className="space-y-2">
              {roomInstances.map((t) => (
                <label key={t.task_instance_id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedInstanceIds.has(t.task_instance_id)}
                    onChange={() => toggleTask(t.task_instance_id)}
                  />
                  <span className="text-sm">
                    {(t.task_template as { title?: string })?.title ?? "Task"}
                  </span>
                </label>
              ))}
            </div>
          )}
          <Button className="mt-4" onClick={handleNext} disabled={selectedInstanceIds.size === 0}>
            Start session
          </Button>
        </SectionCard>
      )}
      {!loading && step === "check_off" && (
        <SectionCard className="p-6">
          <h2 className="font-medium mb-3">Check off tasks</h2>
          {Array.from(selectedInstanceIds).map((id) => {
            const t = instances.find((i) => i.task_instance_id === id)
            if (!t) return null
            const done = completedIds.has(id)
            return (
              <div key={id} className="flex items-center justify-between py-2 border-b border-border">
                <span className={done ? "line-through text-muted-foreground" : ""}>
                  {(t.task_template as { title?: string })?.title ?? "Task"}
                </span>
                <Button variant="ghost" size="sm" onClick={() => markDone(id)} disabled={done}>
                  {done ? <Check className="h-4 w-4 text-green-600" /> : "Done"}
                </Button>
              </div>
            )
          })}
          <Button className="mt-4" onClick={handleNext}>
            Finish
          </Button>
        </SectionCard>
      )}
      {!loading && step === "summary" && (
        <SectionCard className="p-6">
          <h2 className="font-medium mb-3">Summary</h2>
          <p className="text-sm text-muted-foreground">
            Completed {completedIds.size} of {selectedInstanceIds.size} tasks.
          </p>
        </SectionCard>
      )}
    </PageContainer>
  )
}
