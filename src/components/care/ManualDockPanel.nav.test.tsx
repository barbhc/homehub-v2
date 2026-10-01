/**
 * The manual dock's page state: what it opens on, and what turning a page does.
 *
 * Both resets used to be setState in effects; H5 (the whole-app lint) makes
 * them in the render that asks — the reopen reset and the "Rendering page N…"
 * spinner (useDepsChanged). Pinned: a page turn shows the spinner, then that
 * page; reopening at a new cited page starts there, unzoomed; a page the PDF
 * clamps lands on the page it actually has.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { ManualDockPanel } from "./ManualDockPanel"

const renderManualPage = vi.fn()
vi.mock("./renderManualPage", () => ({ renderManualPage: (...a: unknown[]) => renderManualPage(...a) }))

const URL_ = "https://example.test/manual.pdf"

function Dock({ open = true, pageNumber = 3 }: { open?: boolean; pageNumber?: number }) {
  return (
    <ManualDockPanel
      open={open} onOpenChange={vi.fn()} pdfUrl={URL_} pageNumber={pageNumber}
      isDesktop={false} size={50} onSizeChange={vi.fn()}
    />
  )
}

describe("ManualDockPanel · pages", () => {
  beforeEach(() => {
    renderManualPage.mockReset()
    renderManualPage.mockImplementation(async (_url: string, page: number) => ({
      blobUrl: `blob:p${page}`, totalPages: 20, page,
    }))
  })

  it("a page turn shows the spinner, then that page", async () => {
    render(<Dock />)
    await waitFor(() => expect(screen.getByAltText("Manual page 3")).toBeTruthy())

    let finish: (() => void) | null = null
    renderManualPage.mockImplementationOnce((_url: string, page: number) =>
      new Promise((r) => { finish = () => r({ blobUrl: `blob:p${page}`, totalPages: 20, page }) }))
    fireEvent.click(screen.getByRole("button", { name: "Next page" }))
    expect(screen.getByText("Rendering page 4…")).toBeInTheDocument()
    expect(screen.queryByAltText("Manual page 3")).toBeNull()

    // The renderer is behind a dynamic import; wait for the request to reach it.
    await waitFor(() => expect(renderManualPage).toHaveBeenLastCalledWith(URL_, 4))
    finish!()
    await waitFor(() => expect(screen.getByAltText("Manual page 4")).toBeTruthy())
  })

  it("reopening at a new cited page starts there, unzoomed", async () => {
    const { rerender } = render(<Dock pageNumber={3} />)
    await waitFor(() => expect(screen.getByAltText("Manual page 3")).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }))
    expect(screen.getByText("125%")).toBeInTheDocument()

    rerender(<Dock open={false} pageNumber={3} />)
    rerender(<Dock open pageNumber={9} />)
    expect(screen.getByText("100%")).toBeInTheDocument()
    await waitFor(() => expect(screen.getByAltText("Manual page 9")).toBeTruthy())
    expect(renderManualPage).toHaveBeenLastCalledWith(URL_, 9)
  })

  it("lands on the page the PDF actually has when the cited one is out of range", async () => {
    renderManualPage.mockImplementation(async (_url: string, page: number) => {
      const real = Math.min(page, 12)
      return { blobUrl: `blob:p${real}`, totalPages: 12, page: real }
    })
    render(<Dock pageNumber={40} />)
    await waitFor(() => expect(screen.getByAltText("Manual page 12")).toBeTruthy())
    expect(screen.getByText(/Manual · p\.12/)).toBeInTheDocument()
  })
})
