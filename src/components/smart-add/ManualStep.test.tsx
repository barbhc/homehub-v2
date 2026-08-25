import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { ManualStep } from "./ManualStep"

vi.mock("@/hooks/useAutoFindManuals", () => ({ useAutoFindManuals: () => [false, vi.fn()] }))
vi.mock("./FindManualCard", () => ({ FindManualCard: () => <div>stub search</div> }))

const props = {
  brand: "LG",
  model: "DLGX3901B",
  onConfirm: vi.fn(),
  onSkip: vi.fn(),
  isSaving: false,
  error: null,
}

const pdf = () =>
  new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "manual.pdf", { type: "application/pdf" })

describe("ManualStep — the three sources, ranked AND weighted (HH-115)", () => {
  it("leads with uploading and puts the search last", () => {
    render(<ManualStep {...props} />)
    const body = document.body.textContent ?? ""
    expect(body.indexOf("Upload the PDF")).toBeGreaterThan(-1)
    expect(body.indexOf("Upload the PDF")).toBeLessThan(body.indexOf("Paste a link"))
    expect(body.indexOf("Paste a link")).toBeLessThan(body.indexOf("Let us find it"))
  })

  it("gives upload the ONLY filled button — order alone was too weak a signal", () => {
    render(<ManualStep {...props} />)
    const filled = screen
      .getAllByRole("button")
      .filter((b) => b.getAttribute("data-variant") === "default")
    expect(filled).toHaveLength(1)
    expect(filled[0]).toHaveTextContent("Choose a file")
  })

  it("says the ONE thing that earns upload the top slot", () => {
    render(<ManualStep {...props} />)
    expect(screen.getByText(/the one that always works/i)).toBeInTheDocument()
  })

  it("names at least two ways the search goes wrong, not one line", () => {
    render(<ManualStep {...props} />)
    const caution = screen.getByText(/last resort/i).textContent ?? ""
    expect(caution).toMatch(/parts list/i)
    expect(caution).toMatch(/wrong model/i)
    expect(caution).toMatch(/wrong upkeep/i)
    expect(screen.getByText("Beta")).toBeInTheDocument()
  })

  it("says what kind of link, because people paste the product page", () => {
    render(<ManualStep {...props} />)
    expect(screen.getByText(/Must end in \.pdf — not a web page/)).toBeInTheDocument()
  })

  it("calls the action Scan — never parse, never read", () => {
    render(<ManualStep {...props} />)
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [pdf()] } })
    expect(screen.getByRole("button", { name: /Scan the manual/ })).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/Parse|Analyz|Read the manual/)
  })

  it("never removes the way out", () => {
    render(<ManualStep {...props} />)
    expect(screen.getByRole("button", { name: /I'll add it later/ })).toBeInTheDocument()
  })

  it("hides the search entirely when there is no brand and model to search with", () => {
    render(<ManualStep {...props} brand="" model="" />)
    expect(screen.queryByText("Let us find it")).not.toBeInTheDocument()
  })
})

describe("ManualStep — the CTA reflects whether there is anything to scan", () => {
  it("shows NO scan button until there is something to scan", () => {
    // A permanently dimmed primary read as broken, and competed with the
    // upload card for the eye. It appears when it can do something.
    render(<ManualStep {...props} />)
    expect(screen.queryByRole("button", { name: /Scan the manual/ })).not.toBeInTheDocument()
  })

  it("ENABLES once a file is chosen — the whole point of choosing one", () => {
    // Caught in the journey gallery: the enabled and disabled buttons were
    // pixel-identical, so picking a file produced no visible change and the
    // screen looked stuck. Assert the state, not the pixels.
    render(<ManualStep {...props} />)
    fireEvent.change(document.querySelector('input[type="file"]')!, {
      target: { files: [pdf()] },
    })
    expect(screen.getByText("manual.pdf")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Scan the manual/ })).toBeEnabled()
  })

  it("stays disabled while a save is in flight", () => {
    render(<ManualStep {...props} isSaving />)
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [pdf()] } })
    expect(screen.getByRole("button", { name: /Uploading|Scan the manual/ })).toBeDisabled()
  })

  it("hands the chosen file to onConfirm", () => {
    const onConfirm = vi.fn()
    render(<ManualStep {...props} onConfirm={onConfirm} />)
    fireEvent.change(document.querySelector('input[type="file"]')!, {
      target: { files: [pdf()] },
    })
    fireEvent.click(screen.getByRole("button", { name: /Scan the manual/ }))
    expect(onConfirm).toHaveBeenCalledWith([{ type: "upload", file: expect.any(File) }])
  })

  it("replaces the three options with the one chosen, and lets it be undone", () => {
    render(<ManualStep {...props} />)
    fireEvent.change(document.querySelector('input[type="file"]')!, {
      target: { files: [pdf()] },
    })
    expect(screen.queryByText("Paste a link")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /Remove this manual/ }))
    expect(screen.getByText("Paste a link")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Scan the manual/ })).not.toBeInTheDocument()
  })

  it("reports a file size a person can read, not 0.0 MB", () => {
    // A 4-byte fixture rendered "0.0 MB · PDF", which reads as an empty or
    // broken file. Anything under a megabyte belongs in KB.
    render(<ManualStep {...props} />)
    fireEvent.change(document.querySelector('input[type="file"]')!, {
      target: { files: [pdf()] },
    })
    expect(document.body.textContent).not.toContain("0.0 MB")
  })
})
