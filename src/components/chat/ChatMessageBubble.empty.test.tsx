/**
 * HH-28 — "empty answers say so honestly", and a failed answer offers a retry.
 *
 * An answer that finished with no text rendered an empty bubble: a shape with
 * nothing in it, which reads as the app breaking rather than as "nothing
 * matched". And a failed answer (a dropped connection, or a stream that closed
 * before it finished) left nothing to do but retype the question.
 */
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"

vi.mock("./SaveFaqDialog", () => ({ SaveFaqDialog: () => null }))
const { ChatMessageBubble, EMPTY_ANSWER } = await import("./ChatMessageBubble")

const assistant = (over: Record<string, unknown> = {}) => ({ id: "a1", role: "assistant" as const, content: "", ...over })

describe("an empty answer", () => {
  it("says so in one calm line instead of rendering an empty bubble", () => {
    render(<ChatMessageBubble homeId="h1" message={assistant()} />)
    expect(screen.getByText(EMPTY_ANSWER)).toBeInTheDocument()
    expect(EMPTY_ANSWER).toBe("I couldn't find anything in your manuals for that.")
  })

  it("treats an answer of only whitespace as empty", () => {
    render(<ChatMessageBubble homeId="h1" message={assistant({ content: "  \n " })} />)
    expect(screen.getByText(EMPTY_ANSWER)).toBeInTheDocument()
  })

  it("offers nothing to save or search from an empty answer", () => {
    render(
      <ChatMessageBubble homeId="h1" message={assistant()} precedingQuestion="How do I descale it?" onSaveFaq={vi.fn()} onWebSearch={vi.fn()} />,
    )
    expect(screen.queryByRole("button", { name: /Save to knowledge base/ })).toBeNull()
    expect(screen.queryByRole("button", { name: /Search the web/ })).toBeNull()
  })

  it("is not claimed while the answer is still arriving", () => {
    render(<ChatMessageBubble homeId="h1" message={assistant({ isStreaming: true })} />)
    expect(screen.queryByText(EMPTY_ANSWER)).toBeNull()
  })

  it("never replaces a real answer", () => {
    render(<ChatMessageBubble homeId="h1" message={assistant({ content: "Run the descale cycle monthly." })} />)
    expect(screen.getByText("Run the descale cycle monthly.")).toBeInTheDocument()
    expect(screen.queryByText(EMPTY_ANSWER)).toBeNull()
  })
})

describe("a failed answer", () => {
  it("offers to try again, beside the failure", () => {
    const onRetry = vi.fn()
    render(
      <ChatMessageBubble homeId="h1" onRetry={onRetry} message={assistant({ content: "The answer stopped before it finished.", isError: true })} />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(onRetry).toHaveBeenCalledWith("a1")
    // A failure is not an empty answer.
    expect(screen.queryByText(EMPTY_ANSWER)).toBeNull()
  })

  it("a good answer has no retry", () => {
    render(<ChatMessageBubble homeId="h1" onRetry={vi.fn()} message={assistant({ content: "Monthly." })} />)
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull()
  })
})
