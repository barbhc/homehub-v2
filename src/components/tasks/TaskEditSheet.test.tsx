/**
 * The edit sheet is the "Homehub proposes, the homeowner decides" principle
 * made operable — until now the parser's wording was final. These pin the two
 * behaviours that would quietly betray that: saving a blank name, and letting a
 * partial save report success.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { TaskEditSheet } from "./TaskEditSheet"

const updateTaskContent = vi.fn()
const rescheduleTaskInstance = vi.fn()
vi.mock("@/modules/care", () => ({
  updateTaskContent: (...a: unknown[]) => updateTaskContent(...a),
  rescheduleTaskInstance: (...a: unknown[]) => rescheduleTaskInstance(...a),
}))

const detail = {
  taskInstanceId: "inst1",
  taskTemplateId: "tpl1",
  title: "Check Grate Support Bumpers",
  dueDate: "2026-08-15",
  steps: ["Lift the grate.", "Inspect each bumper."],
} as never

beforeEach(() => {
  updateTaskContent.mockReset().mockResolvedValue({ data: null, error: null })
  rescheduleTaskInstance.mockReset().mockResolvedValue({ data: null, error: null })
})

describe("TaskEditSheet", () => {
  it("saves nothing until something actually changed", () => {
    render(<TaskEditSheet homeId="h1" detail={detail} onClose={() => {}} onSaved={() => {}} />)
    expect(screen.getByRole("button", { name: /save changes/i })).toBeDisabled()
  })

  it("sends only the fields that changed, and reports saved", async () => {
    const onSaved = vi.fn()
    render(<TaskEditSheet homeId="h1" detail={detail} onClose={() => {}} onSaved={onSaved} />)
    fireEvent.change(screen.getByPlaceholderText(/what is this task called/i), {
      target: { value: "Check the range grate bumpers" },
    })
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(updateTaskContent).toHaveBeenCalledWith("h1", "tpl1", { title: "Check the range grate bumpers" })
    // The date never changed, so the occurrence must not be rescheduled.
    expect(rescheduleTaskInstance).not.toHaveBeenCalled()
  })

  it("a failed content save STOPS — no date write, no false success", async () => {
    updateTaskContent.mockResolvedValue({ data: null, error: { message: "A task needs a name." } })
    const onSaved = vi.fn()
    render(<TaskEditSheet homeId="h1" detail={detail} onClose={() => {}} onSaved={onSaved} />)
    fireEvent.change(screen.getByPlaceholderText(/what is this task called/i), { target: { value: "x" } })
    fireEvent.change(screen.getByDisplayValue("2026-08-15"), { target: { value: "2026-09-01" } })
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }))
    await waitFor(() => expect(screen.getByText("A task needs a name.")).toBeInTheDocument())
    expect(rescheduleTaskInstance).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it("steps can be edited, added, and removed", async () => {
    const onSaved = vi.fn()
    render(<TaskEditSheet homeId="h1" detail={detail} onClose={() => {}} onSaved={onSaved} />)
    fireEvent.click(screen.getByRole("button", { name: /remove step 2/i }))
    fireEvent.click(screen.getByRole("button", { name: /add a step/i }))
    fireEvent.change(screen.getByPlaceholderText("Step 2"), { target: { value: "Replace any cracked bumper." } })
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(updateTaskContent).toHaveBeenCalledWith("h1", "tpl1", {
      steps: ["Lift the grate.", "Replace any cracked bumper."],
    })
  })
})
