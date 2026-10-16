/**
 * Deleting a saved Q&A that fails says so (audit 2026-10-15). The answer
 * stayed listed — correctly, it still exists — but Delete looked like it had
 * done nothing, with the reason only in the console.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

const deleteFaq = vi.fn()
vi.mock("@/modules/knowledge", () => ({ deleteFaq: (...a: unknown[]) => deleteFaq(...a) }))
vi.mock("@/components/knowledge", () => ({ CleaningGuideCard: () => null }))

const { KnowledgeSection } = await import("./KnowledgeSection")

const faq = { faq_id: "f1", home_id: "h1", question: "How do I descale it?", answer: "Vinegar cycle." } as never

beforeEach(() => {
  deleteFaq.mockReset()
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

const open = (onFaqsChange = vi.fn()) => {
  render(<KnowledgeSection chunks={[]} faqs={[faq]} hasParsedManual={false} onFaqsChange={onFaqsChange} />)
  fireEvent.click(screen.getByRole("button", { name: /Saved Q&A/ }))
  return onFaqsChange
}

describe("KnowledgeSection — deleting a saved Q&A", () => {
  it("a refused delete keeps the answer and says so", async () => {
    deleteFaq.mockResolvedValue({ data: null, error: { message: "permission-denied" } })
    const onFaqsChange = open()
    fireEvent.click(screen.getByRole("button", { name: "Delete saved Q&A" }))
    expect(await screen.findByText("Couldn't delete it. Try again.")).toBeInTheDocument()
    expect(onFaqsChange).not.toHaveBeenCalled()
  })

  it("a delete that lands removes it, with no error (the control case)", async () => {
    deleteFaq.mockResolvedValue({ data: true, error: null })
    const onFaqsChange = open()
    fireEvent.click(screen.getByRole("button", { name: "Delete saved Q&A" }))
    await waitFor(() => expect(onFaqsChange).toHaveBeenCalled())
    expect(screen.queryByText("Couldn't delete it. Try again.")).toBeNull()
  })
})
