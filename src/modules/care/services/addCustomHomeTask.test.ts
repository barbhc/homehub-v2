/**
 * addCustomHomeTask — a whole-home upkeep task in her own words (Tasks → Add
 * your own task, with "Shows in: Upkeep"; design/settings-your-home.md).
 *
 * The form asks how long it takes; the minutes ride on the template. The
 * argument is optional, so the callers that never asked keep working.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const svc = vi.hoisted(() => ({ createTaskTemplate: vi.fn(), setTaskCadence: vi.fn() }))
vi.mock("./taskService", () => ({
  createTaskTemplate: (...a: unknown[]) => svc.createTaskTemplate(...a),
  setTaskCadence: (...a: unknown[]) => svc.setTaskCadence(...a),
  applyCadence: vi.fn(),
  deleteTaskTemplate: vi.fn(),
}))
vi.mock("@/integrations/firebase", () => ({ db: {} }))
vi.mock("firebase/firestore", () => ({ arrayUnion: vi.fn(), doc: vi.fn(), serverTimestamp: vi.fn(), updateDoc: vi.fn() }))

const { addCustomHomeTask } = await import("./careSuggestionService")

beforeEach(() => {
  vi.clearAllMocks()
  svc.createTaskTemplate.mockResolvedValue({ data: { task_template_id: "t1", title: "Oil the gate hinges" }, error: null })
  svc.setTaskCadence.mockResolvedValue({ data: true, error: null })
})

describe("addCustomHomeTask", () => {
  it("creates an upkeep task for the whole home, hers, with the minutes she gave", async () => {
    const res = await addCustomHomeTask("h1", "  Oil the gate hinges ", "quarterly", null, 20)
    expect(res.error).toBeNull()
    expect(svc.createTaskTemplate).toHaveBeenCalledWith(expect.objectContaining({
      home_id: "h1", scope_type: "home", item_unit_id: null, title: "Oil the gate hinges",
      care_type: "maintenance", source: "user", fields_set_by: "user", estimated_minutes: 20,
    }))
    expect(svc.setTaskCadence).toHaveBeenCalledWith("h1", "t1", "quarterly", null)
  })

  it("without minutes (every earlier caller) the template carries none", async () => {
    await addCustomHomeTask("h1", "Flush the water heater", "annual")
    expect(svc.createTaskTemplate.mock.calls[0][0].estimated_minutes).toBeNull()
    await addCustomHomeTask("h1", "Flush the water heater", "annual", null)
    expect(svc.createTaskTemplate.mock.calls[1][0].estimated_minutes).toBeNull()
  })

  it("a task with no name is refused before anything is written", async () => {
    const res = await addCustomHomeTask("h1", "   ", "annual", null, 5)
    expect(res.error?.message).toBe("Give the task a name first")
    expect(svc.createTaskTemplate).not.toHaveBeenCalled()
  })

  it("a create that fails is handed back, and no cadence is written for a task that does not exist", async () => {
    svc.createTaskTemplate.mockResolvedValue({ data: null, error: { message: "permission-denied" } })
    const res = await addCustomHomeTask("h1", "Oil the gate hinges", "weekly", null, 5)
    expect(res.error?.message).toBe("permission-denied")
    expect(svc.setTaskCadence).not.toHaveBeenCalled()
  })

  it("a cadence that fails to save is handed back, not reported as added", async () => {
    svc.setTaskCadence.mockResolvedValue({ data: null, error: { message: "unavailable" } })
    const res = await addCustomHomeTask("h1", "Oil the gate hinges", "weekly", null, 5)
    expect(res.data).toBeNull()
    expect(res.error?.message).toBe("unavailable")
  })
})
