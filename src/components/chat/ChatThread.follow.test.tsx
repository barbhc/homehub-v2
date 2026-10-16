/**
 * Ask's thread follows the bottom only while the reader is there (audit
 * 2026-10-15). It used to scroll to the bottom on every change — each streamed
 * chunk included — so scrolling up to reread an answer was undone mid-sentence.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { ChatThread } from "./ChatThread"
import { stillFollowing } from "./threadFollow"
import type { ChatMessage } from "@/modules/knowledge/services/chatService"

const scrollIntoView = vi.fn()
beforeEach(() => {
  scrollIntoView.mockReset()
  Element.prototype.scrollIntoView = scrollIntoView
})

const q1: ChatMessage = { id: "u1", role: "user", content: "How do I descale it?" }
const a1 = (content: string, isStreaming = false): ChatMessage => ({ id: "a1", role: "assistant", content, isStreaming })

/** Give the thread a scroll position: 1000px of content in a 400px window. */
function scrollThreadTo(thread: HTMLElement, top: number) {
  Object.defineProperty(thread, "scrollHeight", { configurable: true, value: 1000 })
  Object.defineProperty(thread, "clientHeight", { configurable: true, value: 400 })
  thread.scrollTop = top
  fireEvent.scroll(thread)
}

const view = (messages: ChatMessage[]) => <MemoryRouter><ChatThread messages={messages} /></MemoryRouter>

describe("ChatThread — following the latest", () => {
  it("does not pull a reader who scrolled up back down while an answer streams", () => {
    const { container, rerender } = render(view([q1, a1("Unplug it", true)]))
    const thread = container.firstElementChild as HTMLElement
    scrollThreadTo(thread, 600) // at the bottom
    scrollThreadTo(thread, 100) // went back up to reread
    scrollIntoView.mockClear()

    rerender(view([q1, a1("Unplug it and run a cycle of vinegar", true)]))
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it("keeps following while the reader is at the bottom", () => {
    const { container, rerender } = render(view([q1, a1("Unplug it", true)]))
    const thread = container.firstElementChild as HTMLElement
    scrollThreadTo(thread, 600)
    scrollIntoView.mockClear()

    rerender(view([q1, a1("Unplug it and run a cycle of vinegar", true)]))
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })

  it("always scrolls to a message the reader just sent, even from further up", () => {
    const { container, rerender } = render(view([q1, a1("Unplug it")]))
    const thread = container.firstElementChild as HTMLElement
    scrollThreadTo(thread, 600)
    scrollThreadTo(thread, 100)
    scrollIntoView.mockClear()

    const q2: ChatMessage = { id: "u2", role: "user", content: "How often?" }
    rerender(view([q1, a1("Unplug it"), q2, { id: "a2", role: "assistant", content: "", isStreaming: true }]))
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })
})

describe("stillFollowing", () => {
  it("near the bottom follows; moving up stops; growth alone changes nothing", () => {
    expect(stillFollowing({ top: 590, maxTop: 600, prevTop: 0, following: false })).toBe(true)
    expect(stillFollowing({ top: 100, maxTop: 600, prevTop: 300, following: true })).toBe(false)
    expect(stillFollowing({ top: 300, maxTop: 900, prevTop: 300, following: true })).toBe(true)
    expect(stillFollowing({ top: 300, maxTop: 900, prevTop: 300, following: false })).toBe(false)
  })
})
