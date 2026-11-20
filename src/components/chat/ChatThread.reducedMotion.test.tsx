/**
 * Ask's thread scrolls smoothly to the latest message — except under Reduce
 * Motion, where it jumps. An explicit `behavior: "smooth"` beats the global CSS
 * that turns smooth scrolling into a jump, so the thread has to ask itself.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { render } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { ChatThread } from "./ChatThread"
import type { ChatMessage } from "@/modules/knowledge/services/chatService"

const scrollIntoView = vi.fn()
beforeEach(() => {
  scrollIntoView.mockReset()
  Element.prototype.scrollIntoView = scrollIntoView
})
afterEach(() => vi.restoreAllMocks())

const q1: ChatMessage = { id: "u1", role: "user", content: "How do I descale it?" }
const view = (messages: ChatMessage[]) => <MemoryRouter><ChatThread messages={messages} /></MemoryRouter>

function reduceMotion(on: boolean) {
  const real = window.matchMedia.bind(window)
  vi.spyOn(window, "matchMedia").mockImplementation((q: string) =>
    q.includes("prefers-reduced-motion") ? ({ ...real(q), matches: on, media: q } as MediaQueryList) : real(q),
  )
}

describe("ChatThread — Reduce Motion", () => {
  it("scrolls smoothly by default", () => {
    reduceMotion(false)
    render(view([q1]))
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth" })
  })

  it("jumps under Reduce Motion", () => {
    reduceMotion(true)
    render(view([q1]))
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "auto" })
  })
})
