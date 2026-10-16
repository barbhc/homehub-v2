/**
 * The manual dock's resize handle (audit 2026-10-15): a finger-sized grab
 * area that a page scroll never steals, and a drag the OS cancels ends there
 * instead of following the next pointer around.
 */
import { describe, it, expect, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { ManualDockPanel } from "./ManualDockPanel"

vi.mock("./renderManualPage", () => ({ renderManualPage: () => new Promise(() => {}) }))

function renderDock(onSizeChange = vi.fn(), isDesktop = false) {
  render(
    <ManualDockPanel
      open onOpenChange={vi.fn()} pdfUrl="https://example.test/manual.pdf" pageNumber={1}
      isDesktop={isDesktop} size={50} onSizeChange={onSizeChange}
    />,
  )
  return onSizeChange
}

describe("ManualDockPanel — resize handle", () => {
  it("is a 44px grab area that takes the touch from the page", () => {
    renderDock()
    const handle = screen.getByRole("separator", { name: "Resize manual panel" })
    expect(handle).toHaveClass("h-11", "touch-none")
  })

  it("is 44px wide on desktop too", () => {
    renderDock(vi.fn(), true)
    expect(screen.getByRole("separator", { name: "Resize manual panel" })).toHaveClass("w-11", "touch-none")
  })

  it("a cancelled drag stops resizing", () => {
    const onSizeChange = renderDock()
    const handle = screen.getByRole("separator", { name: "Resize manual panel" })
    fireEvent.pointerDown(handle, { clientY: 400 })
    fireEvent.pointerMove(window, { clientY: 300 })
    expect(onSizeChange).toHaveBeenCalledTimes(1)

    fireEvent.pointerCancel(window)
    fireEvent.pointerMove(window, { clientY: 200 })
    expect(onSizeChange).toHaveBeenCalledTimes(1)
    expect(document.body.style.userSelect).toBe("")
  })
})
