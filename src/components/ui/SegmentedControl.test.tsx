/**
 * The shared segmented control (Tasks: Upkeep | Cleaning, Items: Items |
 * Warranties). Pinned: it is a tab list to assistive tech, every segment is a
 * 44pt target sharing the width equally, and the keyboard works the way a tab
 * list's does — one Tab stop, arrows move and select (wrapping), Home/End.
 */
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { useState } from "react"
import { SegmentedControl } from "./SegmentedControl"

const SEGMENTS = [
  { value: "a", label: "Upkeep" },
  { value: "b", label: "Cleaning" },
  { value: "c", label: "Third" },
] as const
type V = (typeof SEGMENTS)[number]["value"]

function Harness({ onChange }: { onChange?: (v: V) => void }) {
  const [value, setValue] = useState<V>("a")
  return (
    <SegmentedControl
      label="Tasks view"
      segments={SEGMENTS}
      value={value}
      onChange={(v) => { onChange?.(v); setValue(v) }}
    />
  )
}

const tab = (name: string) => screen.getByRole("tab", { name })

describe("SegmentedControl", () => {
  it("is a named tab list whose tabs say which one is selected", () => {
    render(<Harness />)
    const list = screen.getByRole("tablist", { name: "Tasks view" })
    expect(within(list).getAllByRole("tab")).toHaveLength(3)
    expect(tab("Upkeep")).toHaveAttribute("aria-selected", "true")
    expect(tab("Cleaning")).toHaveAttribute("aria-selected", "false")
  })

  it("every segment is at least 44pt tall and takes an equal share of the width", () => {
    render(<Harness />)
    for (const t of screen.getAllByRole("tab")) {
      expect(t.className).toMatch(/\bmin-h-11\b/)
      expect(t.className).toMatch(/\bflex-1\b/)
      expect(t.className).toMatch(/\bbasis-0\b/)
    }
  })

  it("a tap selects; tapping the selected segment does nothing", () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    fireEvent.click(tab("Cleaning"))
    expect(onChange).toHaveBeenLastCalledWith("b")
    expect(tab("Cleaning")).toHaveAttribute("aria-selected", "true")
    fireEvent.click(tab("Cleaning"))
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it("one Tab stop; arrows move focus AND selection, wrapping; Home and End jump to the ends", () => {
    render(<Harness />)
    expect(tab("Upkeep")).toHaveAttribute("tabindex", "0")
    expect(tab("Cleaning")).toHaveAttribute("tabindex", "-1")

    fireEvent.keyDown(tab("Upkeep"), { key: "ArrowRight" })
    expect(tab("Cleaning")).toHaveFocus()
    expect(tab("Cleaning")).toHaveAttribute("aria-selected", "true")
    expect(tab("Cleaning")).toHaveAttribute("tabindex", "0")

    fireEvent.keyDown(tab("Cleaning"), { key: "End" })
    expect(tab("Third")).toHaveAttribute("aria-selected", "true")
    fireEvent.keyDown(tab("Third"), { key: "ArrowRight" })
    expect(tab("Upkeep")).toHaveAttribute("aria-selected", "true")
    fireEvent.keyDown(tab("Upkeep"), { key: "ArrowLeft" })
    expect(tab("Third")).toHaveFocus()
    fireEvent.keyDown(tab("Third"), { key: "Home" })
    expect(tab("Upkeep")).toHaveAttribute("aria-selected", "true")
  })
})
