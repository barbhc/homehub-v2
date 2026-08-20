/**
 * The tour-hijack guard (pre-beta audit, 2026-08-19).
 *
 * Auto-start is async twice over — a preference read, then a settle timer —
 * and the user keeps moving while both run. The audit's production smoke
 * caught a five-step dashboard tour opening over the ITEM PAGE the moment a
 * brand-new user tapped "Find the manual". These pin the refusals.
 */
import { describe, it, expect, beforeEach } from "vitest"
import { tourCanStartNow } from "@/hooks/useFeatureTour"

const NAV = "[data-tour='nav-home']"

function mountNav() {
  const el = document.createElement("div")
  el.setAttribute("data-tour", "nav-home")
  // jsdom reports 0×0 for everything; give the guard a visible rect.
  el.getBoundingClientRect = () => ({ width: 40, height: 40, top: 0, left: 0, right: 40, bottom: 40, x: 0, y: 0, toJSON: () => ({}) })
  document.body.appendChild(el)
  return el
}

beforeEach(() => { document.body.innerHTML = "" })

describe("tourCanStartNow", () => {
  it("starts on a quiet dashboard", () => {
    mountNav()
    expect(tourCanStartNow(NAV, "/home", document)).toBe(true)
  })

  it("refuses when the user outran the timer to another page — the reported hijack", () => {
    mountNav()
    expect(tourCanStartNow(NAV, "/items/levoit-core-300", document)).toBe(false)
  })

  it("refuses while any dialog is open — never interrupt a task", () => {
    mountNav()
    const dlg = document.createElement("div")
    dlg.setAttribute("role", "dialog")
    document.body.appendChild(dlg)
    expect(tourCanStartNow(NAV, "/home", document)).toBe(false)
  })

  it("refuses while a tour is already showing", () => {
    mountNav()
    const pop = document.createElement("div")
    pop.className = "driver-popover"
    document.body.appendChild(pop)
    expect(tourCanStartNow(NAV, "/home", document)).toBe(false)
  })

  it("defers to a surface that declares itself a no-tour zone — the empty state", () => {
    mountNav()
    const hero = document.createElement("div")
    hero.setAttribute("data-tour-halt", "")
    document.body.appendChild(hero)
    expect(tourCanStartNow(NAV, "/home", document)).toBe(false)
  })

  it("refuses when the first step's target is missing or invisible", () => {
    expect(tourCanStartNow(NAV, "/home", document)).toBe(false)
    const el = document.createElement("div")
    el.setAttribute("data-tour", "nav-home") // present but 0×0 in jsdom
    document.body.appendChild(el)
    expect(tourCanStartNow(NAV, "/home", document)).toBe(false)
  })
})
