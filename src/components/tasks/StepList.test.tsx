/**
 * One number system per screen.
 *
 * Steps were numbered circles, but inside a deep-clean guide the SECTIONS are
 * numbered too — so "5. Clean the Appliance Exterior" contained steps 1-5, two
 * independent counters in the same glyph. Steps were always tickable, so they
 * became checkboxes: numbers now mean "where you are in the guide" and nothing
 * else, and order is carried by list position.
 */
import { describe, it, expect } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { StepList } from "./TaskHowTo"

describe("StepList", () => {
  it("renders no step numbers", () => {
    const { container } = render(<StepList steps={["Unplug the dryer.", "Wipe the seal.", "Dry it."]} />)
    const items = [...container.querySelectorAll("li")]
    expect(items).toHaveLength(3)
    // No standalone numeral anywhere in a row.
    for (const li of items) {
      expect(li.textContent).not.toMatch(/^\s*\d+\s*[A-Z]/)
      expect([...li.querySelectorAll("span")].some((s) => /^\d+$/.test(s.textContent ?? ""))).toBe(false)
    }
  })

  it("each step is a checkbox that ticks and strikes through", () => {
    const { container } = render(<StepList steps={["Unplug the dryer."]} />)
    const row = screen.getByRole("button")
    const text = screen.getByText("Unplug the dryer.")
    expect(text).not.toHaveStyle({ textDecoration: "line-through" })
    fireEvent.click(row)
    expect(screen.getByText("Unplug the dryer.")).toHaveStyle({ textDecoration: "line-through" })
    expect(container.querySelectorAll("svg").length).toBeGreaterThan(0)
  })
})
