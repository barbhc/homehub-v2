/**
 * A label scan the user walked away from must land nowhere.
 *
 * Codex adversarial review 2026-10-29, finding 10. `processImageFile` already
 * guarded against a NEWER scan (`requestId !== ocrRequestIdRef.current`), but
 * Back out of the appliance lane called `clearOcrState()`, which cleared the
 * display state and left the request id untouched. So the in-flight scan's
 * reply still matched, and it wrote the form object it had closed over — the
 * pre-Back one.
 *
 * The sequence that loses a name: start a slow label scan, press Back, choose
 * "Everything else", type "Patio sofa". The late reply puts the pre-Back form
 * back, erasing the name and disabling Add.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { IdentifyStep, type IdentifyData } from "./IdentifyStep"
import { DEFAULT_IDENTIFY_DATA } from "./identifyData"

const ocr = vi.hoisted(() => ({
  release: null as null | ((v: unknown) => void),
  calls: 0,
}))

vi.mock("@/modules/home", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useCurrentHome: () => ({ home: { home_id: "home-1", name: "Test Home" } }),
  getRooms: async () => ({ data: [], error: null }),
}))
vi.mock("@/modules/inventory/services/productLookupService", () => ({
  lookupProduct: async () => ({ data: null, error: null }),
  lookupBrandForModel: async () => null,
}))
vi.mock("@/lib/downscaleImage", () => ({ downscaleImage: async (f: File) => f }))
vi.mock("@/modules/inventory/services/ocrService", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  // Held open until the test releases it, so "in flight" is a real state.
  extractFromImage: () => {
    ocr.calls += 1
    return new Promise((res) => { ocr.release = res })
  },
}))

const photo = () => new File(["jpegbytes"], "label.jpg", { type: "image/jpeg" })

function mount(onDataChange: (d: IdentifyData) => void, onModeChange: (m: "choice" | "appliance" | "simple") => void) {
  const utils = render(
    <IdentifyStep
      mode="appliance"
      data={{ ...DEFAULT_IDENTIFY_DATA }}
      onModeChange={onModeChange}
      onDataChange={onDataChange}
      onConfirm={vi.fn()}
      isCreating={false}
      error={null}
    />,
  )
  // Both of the lane's image inputs are hidden; either one carries a label photo.
  const input = utils.container.querySelector<HTMLInputElement>('input[type="file"][accept="image/*"]')
  expect(input, "the appliance lane's image input").not.toBeNull()
  return { ...utils, input: input! }
}

beforeEach(() => {
  ocr.release = null
  ocr.calls = 0
})

describe("a label scan abandoned by leaving the lane", () => {
  it("writes nothing to the form when it comes back", async () => {
    const onDataChange = vi.fn()
    const onModeChange = vi.fn()
    const { input } = mount(onDataChange, onModeChange)

    fireEvent.change(input, { target: { files: [photo()] } })
    await waitFor(() => expect(ocr.calls).toBe(1))

    // Back out of the lane — the chooser, then another lane, is where the
    // person goes next.
    fireEvent.click(screen.getByRole("button", { name: /^back$/i }))
    expect(onModeChange).toHaveBeenCalledWith("choice")
    onDataChange.mockClear()

    // The scan it had started finally answers.
    ocr.release?.({ data: { brand: "Bosch", model: "SHPM88", text: "BOSCH SHPM88" }, error: null })
    await new Promise((r) => setTimeout(r, 0))

    // Nothing. The form the user is now filling in belongs to another lane.
    expect(onDataChange).not.toHaveBeenCalled()
  })

  // NOT asserted here: that `clearOcrState` also clears `ocrLoading`.
  //
  // It is part of the fix — an abandoned request must not leave the flag set,
  // because "Scan the label" is `disabled={ocrLoading}` — but it has no
  // observable consequence this harness can reach. Picking a photo swaps that
  // button out for the preview card, and Back unmounts the preview card with
  // it, so neither control is on screen at the moment that would distinguish
  // the two behaviours.
  //
  // Two earlier attempts at an assertion here are worth recording, because
  // both PASSED against the bug: one looked for a spinner that lives inside
  // `labelPreviewUrl &&` (cleared either way), and one looked for the scan
  // button during the read (not rendered then). A test that cannot fail is
  // worse than no test — it is a green light pointing at nothing.

  it("a scan the user stayed for still fills the form (the control case)", async () => {
    const onDataChange = vi.fn()
    const { input } = mount(onDataChange, vi.fn())

    fireEvent.change(input, { target: { files: [photo()] } })
    await waitFor(() => expect(ocr.calls).toBe(1))

    ocr.release?.({ data: { brand: "Bosch", model: "SHPM88", text: "BOSCH SHPM88" }, error: null })

    await waitFor(() => expect(onDataChange).toHaveBeenCalled())
    const written = onDataChange.mock.calls.at(-1)?.[0] as IdentifyData
    expect(written.brand).toBe("Bosch")
    expect(written.model).toBe("SHPM88")
  })
})
