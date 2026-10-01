/**
 * markTaskInstanceDone after the completion has LANDED (audit H6 follow-up).
 *
 * The completeTask callable is the write; the getDoc after it only reads the
 * instance back. That read sat outside the service's try, so a failed
 * read-back REJECTED — and Home's handler (no catch: the service never throws)
 * left the row dimmed on "completing" forever, with no receipt and no error,
 * for a task that was done. A read-back that found nothing said "not done".
 *
 * The task is done either way: success, logged, and the caller's refetch shows it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const svc = vi.hoisted(() => ({ complete: vi.fn(), getDoc: vi.fn() }))

vi.mock("@/integrations/firebase", () => ({
  db: {},
  callable: (name: string) => (data: unknown) => (name === "completeTask" ? svc.complete(data) : Promise.reject(new Error(`unexpected ${name}`))),
}))
vi.mock("firebase/firestore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("firebase/firestore")>()),
  doc: vi.fn(() => ({})),
  getDoc: (...a: unknown[]) => svc.getDoc(...a),
}))
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }))

const { markTaskInstanceDone } = await import("./taskService")

beforeEach(() => {
  vi.clearAllMocks()
  svc.complete.mockResolvedValue({ completedInstanceId: "ti-1", nextInstanceId: "ti-2" })
})

describe("markTaskInstanceDone — the read-back never undoes a completion", () => {
  it("a read-back that throws is still a success, and never a rejection", async () => {
    svc.getDoc.mockRejectedValue(new Error("Failed to get document because the client is offline."))
    const res = await markTaskInstanceDone("home-1", "ti-1")
    expect(res).toEqual({ success: true, data: null, nextInstanceId: "ti-2" })
  })

  it("a read-back that finds nothing is still a success — not 'not done'", async () => {
    svc.getDoc.mockResolvedValue({ exists: () => false })
    const res = await markTaskInstanceDone("home-1", "ti-1")
    expect(res).toEqual({ success: true, data: null, nextInstanceId: "ti-2" })
  })

  it("a read-back that works returns the instance (the control case)", async () => {
    svc.getDoc.mockResolvedValue({ exists: () => true, id: "ti-1", data: () => ({ status: "done", taskTemplateId: "tt-1" }) })
    const res = await markTaskInstanceDone("home-1", "ti-1")
    expect(res.success).toBe(true)
    expect(res.success && res.data?.task_instance_id).toBe("ti-1")
  })

  it("a completion the server refuses is a failure, and nothing is read back", async () => {
    svc.complete.mockRejectedValue(new Error("INTERNAL"))
    const res = await markTaskInstanceDone("home-1", "ti-1")
    expect(res).toEqual({ success: false, error: "INTERNAL" })
    expect(svc.getDoc).not.toHaveBeenCalled()
  })
})
