/**
 * The one reading indicator (HH-161) — the pill, on every page, including the
 * item whose manual is being read. It SUPERSEDES HH-118's stand-down, and its
 * Review opens the review in place on that item's own page.
 *
 * Frames S1.3, S2.3, S3.5, S6.1–S6.4 of design/mocks/scan-indicator.
 */
import { describe, expect, it, vi, beforeEach } from "vitest"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom"
import type { ParseTray, TrayEntry } from "@/hooks/useParseTray"
import { SCAN_KEEPS_GOING_SHORT } from "@/lib/scanCopy"

const fake = vi.hoisted(() => ({ tray: { parsing: [], ready: [] } as ParseTray }))
vi.mock("@/hooks/useParseTray", () => ({ useParseTray: () => fake.tray }))
vi.mock("@/modules/home", () => ({ useCurrentHome: () => ({ home: { home_id: "h1" } }) }))

import { ParseTrayPill } from "./ParseTrayPill"
import { onReviewRequest, pendingReviewFor, takeReviewRequest } from "@/lib/reviewRequest"

const entry = (over: Partial<TrayEntry>): TrayEntry => ({
  manualId: "m1", itemUnitId: "item-1", title: "Bosch dishwasher manual", pages: 42, stage: "claude_call", ...over,
})

function Where() {
  const l = useLocation()
  return <span data-testid="where">{l.pathname}</span>
}

function at(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="*" element={<><Where /><ParseTrayPill /></>} />
      </Routes>
    </MemoryRouter>,
  )
}

const pill = (name: RegExp | string) => screen.getByRole("button", { name })

beforeEach(() => {
  fake.tray = { parsing: [], ready: [] }
  // Drain any request a previous case left pending.
  for (const id of ["m1", "m9"]) takeReviewRequest(id)
})

describe("one indicator, on every page — no stand-down (HH-161 supersedes HH-118)", () => {
  it("S1.3 — '1 reading' on the item's OWN page, above the tab bar", () => {
    fake.tray = { parsing: [entry({})], ready: [] }
    at("/items/item-1")
    expect(pill("1 reading")).toBeVisible()
  })

  it("S6.1 — the same pill, same words, on Home", () => {
    fake.tray = { parsing: [entry({})], ready: [] }
    at("/home")
    expect(pill("1 reading")).toBeVisible()
  })

  it("S2.3 / S3.5 / S6.4 — '1 ready to review' once the read is done, on the item page and everywhere else", () => {
    fake.tray = { parsing: [], ready: [entry({ stage: "done" })] }
    const onItem = at("/items/item-1")
    expect(pill("1 ready to review")).toBeVisible()
    onItem.unmount()
    at("/maintenance")
    expect(pill("1 ready to review")).toBeVisible()
  })

  it("says 'reading', never 'scanning' or 'parsing' (the vocabulary the mock adopts)", () => {
    fake.tray = { parsing: [entry({}), entry({ manualId: "m2", stage: "awaiting_capacity" })], ready: [entry({ manualId: "m3", stage: "done" })] }
    at("/home")
    expect(pill("1 reading · 1 queued · 1 ready to review")).toBeVisible()
    expect(document.body.textContent).not.toMatch(/scanning|parsing/i)
  })

  it("renders nothing, and reserves no space, when nothing is being read or waiting", () => {
    at("/items/item-1")
    expect(screen.queryByRole("button")).toBeNull()
    expect(screen.queryByTestId("tray-clearance")).toBeNull()
  })

  it("gives the page room to scroll clear of it while it shows (HH-118's actual complaint)", () => {
    fake.tray = { parsing: [entry({})], ready: [] }
    at("/items/item-1")
    expect(screen.getByTestId("tray-clearance")).toBeInTheDocument()
  })

  it("its spinner turns only while something is read, and holds still under reduced motion", () => {
    fake.tray = { parsing: [entry({})], ready: [] }
    at("/home")
    const spinner = pill("1 reading").querySelector("svg")!
    expect(spinner.getAttribute("class")).toContain("motion-safe:animate-spin")
    expect(spinner.getAttribute("class")).not.toMatch(/(^|\s)animate-spin/)
  })
})

describe("S6.2 — the tray", () => {
  it("names the manual, the worker's page count, and 'You can close the app — these keep going.'", () => {
    fake.tray = { parsing: [entry({})], ready: [] }
    at("/home")
    fireEvent.click(pill("1 reading"))
    expect(screen.getByText("Bosch dishwasher manual")).toBeInTheDocument()
    expect(screen.getByText("42 pages")).toBeInTheDocument()
    expect(screen.getByText(SCAN_KEEPS_GOING_SHORT)).toBeInTheDocument()
  })
})

describe("Review opens the review — in place on the item's own page (S2.3)", () => {
  it("on the item page: asks the page's hand-off for the review, and does NOT navigate", () => {
    fake.tray = { parsing: [], ready: [entry({ stage: "done" })] }
    const heard: string[] = []
    const stop = onReviewRequest((id) => heard.push(id))
    at("/items/item-1")
    fireEvent.click(pill("1 ready to review"))
    act(() => { fireEvent.click(screen.getByRole("button", { name: "Review" })) })
    stop()
    expect(heard).toEqual(["m1"])
    expect(screen.getByTestId("where").textContent).toBe("/items/item-1")
  })

  it("anywhere else: goes to the item, with the request waiting for its page", () => {
    fake.tray = { parsing: [], ready: [entry({ manualId: "m9", itemUnitId: "item-9", stage: "done" })] }
    at("/home")
    fireEvent.click(pill("1 ready to review"))
    fireEvent.click(screen.getByRole("button", { name: "Review" }))
    expect(screen.getByTestId("where").textContent).toBe("/items/item-9")
    expect(pendingReviewFor()).toBe("m9")
  })
})
