/**
 * useSetupCompletion — which setup steps are done.
 *
 * With no steps (or no home) the done-map used to be cleared by setState
 * inside the effect; H5 (the whole-app lint) clears it in the render that
 * learns it. CareBlock.setup.failure.test.tsx pins the read and the ticks;
 * this pins the reads by step set: done steps are read; losing the steps
 * clears them at once; a new step set is read again.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import type { TaskTemplateWithSchedule } from "@/modules/care"

const fs = vi.hoisted(() => ({ getDocs: vi.fn() }))
vi.mock("firebase/firestore", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getDocs: (...a: unknown[]) => fs.getDocs(...a),
}))
vi.mock("@/modules/care", () => ({ logTaskCompletion: vi.fn() }))

const { useSetupCompletion } = await import("./useSetupCompletion")

const step = (id: string) => ({ task_template_id: id }) as TaskTemplateWithSchedule
const doneDoc = (id: string, tplId: string) => ({
  id, data: () => ({ taskTemplateId: tplId, status: "done", deletedAt: null, completedAt: null }),
})

describe("useSetupCompletion · which steps are done", () => {
  beforeEach(() => {
    fs.getDocs.mockReset().mockResolvedValue({ docs: [doneDoc("inst-1", "s1")] })
  })

  it("reads the done steps, clears them at once when there are no steps, and reads a new set again", async () => {
    const { result, rerender } = renderHook(
      ({ tasks }: { tasks: TaskTemplateWithSchedule[] }) => useSetupCompletion(tasks, "home-1", "item-1"),
      { initialProps: { tasks: [step("s1"), step("s2")] } },
    )
    await waitFor(() => expect(result.current.doneCount).toBe(1))
    expect(result.current.isDone("s1")).toBe(true)
    expect(result.current.isDone("s2")).toBe(false)

    rerender({ tasks: [] })
    expect(result.current.doneCount).toBe(0)

    fs.getDocs.mockResolvedValue({ docs: [doneDoc("inst-2", "s3")] })
    rerender({ tasks: [step("s3")] })
    await waitFor(() => expect(result.current.isDone("s3")).toBe(true))
    expect(fs.getDocs).toHaveBeenCalledTimes(2)
  })
})
