/**
 * The manual dock after a deploy replaced its assets.
 *
 * Reported by the owner on 2026-09-08: the viewer said "Couldn't render this
 * page." on a tab that had been open across a redeploy, and kept saying it —
 * the renderer chunk it asked for was gone, and Hosting answered with
 * index.html. Routes already reload once in that situation; this viewer did
 * not, because it pulls its renderer in with a bare dynamic import.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { ManualDockPanel } from "./ManualDockPanel"

const renderManualPage = vi.fn()
vi.mock("./renderManualPage", () => ({ renderManualPage: (...a: unknown[]) => renderManualPage(...a) }))

const STALE = new TypeError(
  'Failed to load module script: Expected a JavaScript-or-Wasm module script but the server ' +
  'responded with a MIME type of "text/html".',
)

function reloadSpy() {
  const reload = vi.fn()
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, reload },
  })
  return reload
}

function renderDock() {
  return render(
    <ManualDockPanel
      open
      onOpenChange={vi.fn()}
      pdfUrl="https://example.test/manual.pdf"
      pageNumber={13}
      isDesktop={false}
      size={50}
      onSizeChange={vi.fn()}
    />,
  )
}

describe("ManualDockPanel — assets replaced by a deploy", () => {
  const realLocation = window.location

  beforeEach(() => { sessionStorage.clear(); renderManualPage.mockReset() })
  afterEach(() => {
    vi.restoreAllMocks()
    Object.defineProperty(window, "location", { configurable: true, value: realLocation })
  })

  it("reloads once instead of showing the error, and never flashes it on the way", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const reload = reloadSpy()
    renderManualPage.mockRejectedValue(STALE)

    renderDock()

    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
    // The panel stays on its loading state: an error would be wrong, since the
    // page is about to be replaced by the reload.
    expect(screen.queryByText(/Couldn't render this page/)).toBeNull()
  })

  it("still shows the error for a real failure, and does NOT reload", async () => {
    const reload = reloadSpy()
    renderManualPage.mockRejectedValue(new Error("InvalidPDFException: Invalid PDF structure"))

    renderDock()

    await waitFor(() => expect(screen.getByText(/Couldn't render this page/)).toBeTruthy())
    expect(reload).not.toHaveBeenCalled()
  })

  it("renders the page when the assets are current", async () => {
    const reload = reloadSpy()
    renderManualPage.mockResolvedValue({ blobUrl: "blob:manual-13", totalPages: 56, page: 13 })

    renderDock()

    await waitFor(() => expect(screen.getByAltText("Manual page 13")).toBeTruthy())
    expect(reload).not.toHaveBeenCalled()
  })
})
