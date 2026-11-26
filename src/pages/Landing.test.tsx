/**
 * The welcome page's hero (seventeen fixes, mock m6; owner-approved
 * 2026-11-25). Quoted must-be-true:
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
  it("keeps the headline and says zip and kind of home under it", () => {
    renderPage()
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Everything your home needs, in one place.")
    expect(screen.getByText("Tell us your zip and the kind of home you have. Homehub gives you the few tasks that matter this month and reminds you when they’re due.")).toBeInTheDocument()
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
    for (const h of ["Built around your home", "Up and running in minutes", "See what your home needs this month"]) {
      expect(screen.getByRole("heading", { name: h })).toBeInTheDocument()
    }
    expect(screen.getAllByRole("link", { name: "Get started" }).length).toBe(2)
  })
})
