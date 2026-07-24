/**
 * BrandAutocomplete behavior — the contract the iOS-broken <datalist> couldn't
 * meet: suggestions are real DOM (not browser chrome), a tap/click actually
 * fills the field, blur-before-click can't eat the selection, and free text is
 * never restricted.
 */
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { useState } from "react"
import { BrandAutocomplete, brandSuggestionsFor } from "./BrandAutocomplete"

function Harness({ onChange }: { onChange?: (v: string) => void }) {
  const [value, setValue] = useState("")
  return (
    <BrandAutocomplete
      id="brand"
      value={value}
      onChange={(v) => {
        setValue(v)
        onChange?.(v)
      }}
      placeholder="e.g., LG"
    />
  )
}

describe("brandSuggestionsFor", () => {
  it("prefix matches rank before contains matches, capped at 6", () => {
    const sha = brandSuggestionsFor("Sha")
    expect(sha[0]).toBe("Sharp")
    expect(sha).toContain("Shark")
    expect(brandSuggestionsFor("e").length).toBeLessThanOrEqual(6)
  })

  it("an exactly-typed brand yields no redundant suggestion", () => {
    expect(brandSuggestionsFor("Sharp")).not.toContain("Sharp")
  })

  it("empty query suggests nothing", () => {
    expect(brandSuggestionsFor("  ")).toEqual([])
  })
})

describe("BrandAutocomplete", () => {
  it("typing opens a real DOM listbox with matches", () => {
    render(<Harness />)
    const input = screen.getByRole("combobox")
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: "Sha" } })
    expect(screen.getByRole("listbox")).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "Sharp" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "Shark" })).toBeInTheDocument()
  })

  it("clicking a suggestion fills the field and closes the list", () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const input = screen.getByRole("combobox")
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: "Sha" } })
    const option = screen.getByRole("option", { name: "Sharp" })
    // The real-world sequence: mousedown (must NOT blur-close the list), click.
    fireEvent.mouseDown(option)
    fireEvent.click(option)
    expect(onChange).toHaveBeenLastCalledWith("Sharp")
    expect((input as HTMLInputElement).value).toBe("Sharp")
    expect(screen.queryByRole("listbox")).toBeNull()
  })

  it("mousedown on an option prevents default so input blur can't fire first", () => {
    render(<Harness />)
    const input = screen.getByRole("combobox")
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: "Sha" } })
    const option = screen.getByRole("option", { name: "Sharp" })
    const ev = new MouseEvent("mousedown", { bubbles: true, cancelable: true })
    option.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)
  })

  it("ArrowDown + Enter selects the highlighted brand", () => {
    render(<Harness />)
    const input = screen.getByRole("combobox")
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: "Sha" } })
    fireEvent.keyDown(input, { key: "ArrowDown" })
    fireEvent.keyDown(input, { key: "Enter" })
    expect((input as HTMLInputElement).value).toBe("Sharp")
  })

  it("free text that matches nothing keeps the input usable, no list", () => {
    render(<Harness />)
    const input = screen.getByRole("combobox")
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: "Zline Custom Co" } })
    expect((input as HTMLInputElement).value).toBe("Zline Custom Co")
    expect(screen.queryByRole("listbox")).toBeNull()
  })

  it("blur closes the list", () => {
    render(<Harness />)
    const input = screen.getByRole("combobox")
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: "Sha" } })
    fireEvent.blur(input)
    expect(screen.queryByRole("listbox")).toBeNull()
  })
})
