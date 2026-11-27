/**
 * The welcome page's hero (seventeen fixes, mock m6; owner-approved
 * 2026-11-25), then matched to the marketing page on 2026-11-27 (owner: "match
 * the welcome screen too") — its headline, feature order and titles are
 * public/beta.html's. Quoted must-be-true:
 *   "The line under the headline names the zip and the kind of home."
 *   "The phone shows a capture of the real list screen, not a drawing."
 *   "'Answers from your manuals' is not rendered."
 *   "The page is still a marketing page: benefits, features, screenshots,
 *    questions at the bottom." (Its sections are unchanged; pinned here by
 *    their headings.)
 */
import { describe, expect, it } from "vitest"
import { render, screen, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import Landing from "./Landing"

const renderPage = () => render(<MemoryRouter><Landing /></MemoryRouter>)

describe("the welcome page hero", () => {
  it("says the marketing page's headline, with zip and kind of home under it", () => {
    renderPage()
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("See what your home needs this month.")
    expect(screen.queryByText("Everything your home needs, in one place.")).toBeNull()
    expect(screen.getByText("Enter your zip and the kind of home you have. Homehub gives you the few tasks that matter this month and reminds you when they’re due.")).toBeInTheDocument()
    expect(screen.queryByText(/Items, manuals, warranties, maintenance and a built-in assistant/)).toBeNull()
  })

  it("the phone is a real capture of the first list, light and dark, with alt text — not a drawing", () => {
    renderPage()
    const phone = screen.getByTestId("landing-phone")
    const imgs = within(phone).getAllByRole("img")
    expect(imgs.map((i) => i.getAttribute("src"))).toEqual(["/landing/first-list-light.webp", "/landing/first-list-dark.webp"])
    for (const img of imgs) expect(img.getAttribute("alt")).toMatch(/first list .*94110/i)
    // That the files ship in public/ is pinned in src/lib/copyBeforeFriends.test.ts.
    // The drawing's sample rows are gone.
    expect(screen.queryByText("Clean fridge coils")).toBeNull()
    expect(screen.queryByText("TUESDAY")).toBeNull()
  })

  it("the Ask feature is 'Answers about your home'", () => {
    renderPage()
    expect(screen.getByText("Answers about your home")).toBeInTheDocument()
    expect(screen.queryByText("Answers from your manuals")).toBeNull()
  })

  it("is still a marketing page: features, steps and the closing call", () => {
    renderPage()
    for (const h of ["What Homehub does", "Up and running in minutes", "Start with your zip"]) {
      expect(screen.getByRole("heading", { name: h })).toBeInTheDocument()
    }
    expect(screen.queryByRole("heading", { name: "Built around your home" })).toBeNull()
    expect(screen.getAllByRole("link", { name: "Get started" }).length).toBe(2)
  })

  it("lists the features most compelling first: Maintenance, Ask, Warranties, Inventory", () => {
    renderPage()
    const titles = ["A schedule that builds itself", "Answers about your home", "Know what’s still under warranty", "Every appliance, organized"]
    const tops = titles.map((t) => screen.getByText(t))
    for (let i = 1; i < tops.length; i++) {
      expect(tops[i - 1].compareDocumentPosition(tops[i]) & Node.DOCUMENT_POSITION_FOLLOWING, `${titles[i - 1]} comes before ${titles[i]}`).toBeTruthy()
    }
    // The small uppercase labels over each title are gone (not rendered).
    for (const k of ["Inventory", "Maintenance", "Warranties"]) expect(screen.queryByText(k)).toBeNull()
    expect(screen.queryByText("Coverage you won't forget")).toBeNull()
  })
})
