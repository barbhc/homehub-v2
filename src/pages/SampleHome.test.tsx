import { describe, it, expect } from "vitest"
import { render, screen, fireEvent, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import SampleHome from "./SampleHome"

/**
 * The sample home exists so someone can judge the product before committing to
 * it. Two properties matter and both are easy to break silently: it must not
 * need a home (that is the entire point), and it must actually explain what the
 * product does rather than being a screenshot with extra steps.
 */
const renderPage = () =>
  render(
    <MemoryRouter>
      <SampleHome />
    </MemoryRouter>,
  )

describe("SampleHome", () => {
  it("renders with no auth context, no home, and no network", () => {
    // If this ever needs a provider, it has stopped being reachable by the
    // people it was built for.
    expect(() => renderPage()).not.toThrow()
    expect(screen.getByText("Maple Street")).toBeInTheDocument()
  })

  it("says plainly that it is not the user's home", () => {
    renderPage()
    // Copy changed in the HH-78 redesign; the CONTRACT is unchanged — the page
    // must say it is a sample and that nothing done here is kept.
    expect(screen.getAllByText(/sample home/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/nothing you tap here is saved/i).length).toBeGreaterThan(0)
  })

  it("offers the way out to setting up a real home", () => {
    renderPage()
    const cta = screen.getAllByRole("link", { name: /set up your own home/i })
    expect(cta.length).toBeGreaterThan(0)
    expect(cta[0]).toHaveAttribute("href", "/")
  })

  it("shows a task's reason and its source only after you open it", () => {
    // The pitch is 'these came from your manuals'. Collapsed, that claim is
    // invisible; the disclosure is where the product explains itself.
    renderPage()
    expect(screen.queryByText(/Why this matters/i)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: /Replace the furnace filter/i }))

    expect(screen.getByText(/Why this matters/i)).toBeInTheDocument()
    expect(screen.getByText(/Carrier Infinity 59MN7 manual, p\. 34/i)).toBeInTheDocument()
  })

  it("shows what a manual produced for an item", () => {
    renderPage()
    // Scoped: the dishwasher's name also appears on a TASK row, and an
    // ambiguous query here would pass or fail depending on fixture wording.
    const items = screen.getByRole("region", { name: /the things in this home/i })
    fireEvent.click(within(items).getByRole("button", { name: /Bosch 800 Series Dishwasher/i }))
    expect(screen.getByText(/Clean the filter — monthly/i)).toBeInTheDocument()
    // And that adding rinse aid deliberately did NOT become a reminder — the
    // curation rule, shown rather than claimed.
    expect(screen.getByText(/rinse aid didn't become a reminder/i)).toBeInTheDocument()
  })

  it("marks every disclosure with aria-expanded", () => {
    renderPage()
    const btn = screen.getByRole("button", { name: /Replace the furnace filter/i })
    expect(btn).toHaveAttribute("aria-expanded", "false")
    fireEvent.click(btn)
    expect(btn).toHaveAttribute("aria-expanded", "true")
  })

  it("explains the three steps that produced this home", () => {
    renderPage()
    const how = screen.getByRole("region", { name: /how this home got here/i })
    expect(within(how).getByText(/Photograph the label/i)).toBeInTheDocument()
    expect(within(how).getByText(/review the jobs before any of them become reminders/i)).toBeInTheDocument()
  })
})
