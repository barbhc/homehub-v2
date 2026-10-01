import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
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

describe("a link can be TYPED, key by key (2026-09-30)", () => {
  // The "Manual link added" card used to follow the field's text itself, so
  // the first typed character replaced the field with the card: focus gone,
  // nothing more could be typed, and a link could only ever be pasted. The
  // field now gives way only when the person is done — paste, Enter, leaving
  // the field, or a whole link arriving at once — never mid-word.
  const URL = "https://lg.example/DLGX3901B-owners-manual.pdf"
  const field = () => screen.getByPlaceholderText("https://example.com/manual.pdf")
  const card = () => screen.queryByText("Manual link added")
  const openLinkPanel = (user: ReturnType<typeof userEvent.setup>) =>
    user.click(screen.getByRole("button", { name: /Paste a link/ }))

  it("keeps the field — focused, holding every character — until Enter, then shows the card", async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(<ManualStep {...props} onConfirm={onConfirm} />)
    await openLinkPanel(user)
    const input = field()
    expect(input).toHaveFocus()

    let typed = ""
    for (const ch of URL) {
      await user.keyboard(ch)
      typed += ch
      // The SAME element: still focused, still in the document, holding all of it.
      expect(input).toHaveFocus()
      expect(input).toHaveValue(typed)
      expect(card()).toBeNull() // not rendered mid-word
      expect(screen.queryByRole("button", { name: /Scan the manual/ })).toBeNull()
    }

    await user.keyboard("{Enter}")
    expect(card()).toBeInTheDocument()
    expect(screen.getByText(URL)).toBeInTheDocument()
    // Enter shows the link; scanning it stays a separate, deliberate tap.
    expect(onConfirm).not.toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: /Scan the manual/ }))
    expect(onConfirm).toHaveBeenCalledWith([{ type: "url", url: URL }])
  })

  it("leaving the field finishes the link — a tap on empty space, the keyboard's Done", async () => {
    const user = userEvent.setup()
    render(<ManualStep {...props} />)
    await openLinkPanel(user)
    await user.keyboard(URL)
    expect(card()).toBeNull()

    await user.click(document.body)

    expect(card()).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Scan the manual/ })).toBeEnabled()
  })

  it("pasting still finishes it at once — any text, as before", async () => {
    const user = userEvent.setup()
    render(<ManualStep {...props} />)
    await openLinkPanel(user)
    await user.paste("lg.example/manual.pdf")
    expect(card()).toBeInTheDocument()
  })

  it("a whole link arriving in one change (autofill, a drop) is finished too", async () => {
    const user = userEvent.setup()
    render(<ManualStep {...props} />)
    await openLinkPanel(user)
    fireEvent.change(field(), { target: { value: URL } })
    expect(card()).toBeInTheDocument()
  })

  it("Enter on an empty field chooses nothing", async () => {
    const user = userEvent.setup()
    render(<ManualStep {...props} />)
    await openLinkPanel(user)
    await user.keyboard("{Enter}")
    expect(card()).toBeNull()
    expect(field()).toBeInTheDocument()
  })

  it("pressing another control mid-link runs THAT control, and does not finish the link", async () => {
    const user = userEvent.setup()
    const onSkip = vi.fn()
    render(<ManualStep {...props} onSkip={onSkip} />)
    await openLinkPanel(user)
    await user.keyboard("https://lg.exa")

    await user.click(screen.getByRole("button", { name: /I'll add it later/ }))

    expect(onSkip).toHaveBeenCalledTimes(1)
    expect(card()).toBeNull()
    expect(field()).toHaveValue("https://lg.exa")
  })

  it("…including where a button takes no focus on press (Safari), so the blur names no target", () => {
    // Safari focuses nothing on a button press, so the field's blur carries no
    // relatedTarget. Without the press guard, the card would replace the panel
    // between the press and its click — the click lands on nothing.
    const onSkip = vi.fn()
    render(<ManualStep {...props} onSkip={onSkip} initialPanel="url" />)
    fireEvent.change(field(), { target: { value: "htt" } }) // half a link: not finished
    const skip = screen.getByRole("button", { name: /I'll add it later/ })

    fireEvent.pointerDown(skip)
    fireEvent.blur(field())
    expect(card()).toBeNull()
    fireEvent.click(skip)
    expect(onSkip).toHaveBeenCalledTimes(1)

    // Once that press is over, leaving the field finishes the link again.
    fireEvent.blur(field())
    expect(card()).toBeInTheDocument()
  })
})

describe("the sources read as alternatives — the 'or' rule (owner QA, 2026-09-06)", () => {
  it("joins Upload and Paste a link with a decorative 'or', in that order", () => {
    render(<ManualStep {...props} />)
    const rule = screen.getByTestId("manual-or-rule")
    // Decorative: screen readers get the two headings, not a stray "or".
    expect(rule).toHaveAttribute("aria-hidden", "true")
    expect(rule.textContent?.trim()).toBe("or")
    const body = document.body.textContent ?? ""
    const upload = body.indexOf("Upload the PDF")
    const link = body.indexOf("Paste a link")
    const or = body.indexOf("or", upload + "Upload the PDF".length)
    expect(upload).toBeGreaterThan(-1)
    expect(or).toBeGreaterThan(upload)
    expect(or).toBeLessThan(link)
  })
})
