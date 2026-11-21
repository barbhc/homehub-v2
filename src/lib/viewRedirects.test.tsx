/**
 * /clean and /warranties became views of Tasks and Items
 * (design/tasks-items-views.md). Their old addresses land on those views by a
 * REPLACE — Back never returns to an address that only redirects — and an
 * appliance's cleaning guide (/clean/:itemUnitId) keeps its own page.
 * (That App routes them through these is pinned in retiredDesigns.test.ts.)
 */
import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes, useLocation, useNavigationType } from "react-router-dom"
import { viewRedirectRoutes } from "./viewRedirects"

function Where() {
  const loc = useLocation()
  return <span data-testid="where" data-nav={useNavigationType()}>{loc.pathname + loc.search}</span>
}

const renderAt = (at: string) =>
  render(
    <MemoryRouter initialEntries={[at]}>
      <Routes>
        {viewRedirectRoutes()}
        <Route path="/clean/:itemUnitId" element={<span data-testid="guide" />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  )

describe("view redirects", () => {
  it("/clean lands on Tasks → Cleaning, replacing the old address", () => {
    renderAt("/clean")
    expect(screen.getByTestId("where")).toHaveTextContent("/maintenance?view=cleaning")
    expect(screen.getByTestId("where")).toHaveAttribute("data-nav", "REPLACE")
  })

  it("/warranties lands on Items → Warranties, replacing the old address", () => {
    renderAt("/warranties")
    expect(screen.getByTestId("where")).toHaveTextContent("/inventory?view=warranties")
    expect(screen.getByTestId("where")).toHaveAttribute("data-nav", "REPLACE")
  })

  it("an appliance's cleaning guide is not redirected", () => {
    renderAt("/clean/i1")
    expect(screen.getByTestId("guide")).toBeInTheDocument()
    expect(screen.queryByTestId("where")).toBeNull()
  })
})

