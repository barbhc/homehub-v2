/**
 * The warranty panel covers its last day.
 *
 * "Active" used to be `new Date(expiry) >= new Date()`, and `new Date("2026-09-30")`
 * is UTC midnight — 17:00 on Sep 29 in Pacific — so the panel said "Lapsed ·
 * Expired Sep 30" for the whole of Sep 30, and from 5 pm the evening before.
 * The suite runs in Pacific (vitest.config.ts).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import type { ItemUnit } from "@/integrations/types"

vi.mock("@/modules/items/services/itemService", () => ({ updateItemUnit: vi.fn() }))

import { WarrantyPanel } from "./WarrantyPanel"

const item = {
  item_unit_id: "i1",
  display_name: "Bosch dishwasher",
  brand: "Bosch",
  purchase_date: "2025-09-30",
  install_date: null,
  warranty_expiry_date: "2026-09-30",
  warranty_duration_months: 12,
  warranty_registered_at: null,
  warranty_registration_required: false,
  warranty_exclusions: [],
  warranty_contact: null,
} as unknown as ItemUnit

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
})
afterEach(() => {
  vi.useRealTimers()
})

describe("WarrantyPanel — Active through the expiry date", () => {
  it.each([
    ["the evening before (19:30 Sep 29)", "2026-09-29T19:30:00-07:00"],
    ["the morning of (09:00 Sep 30)", "2026-09-30T09:00:00-07:00"],
    ["the evening of (19:30 Sep 30)", "2026-09-30T19:30:00-07:00"],
  ])("%s: Active, covered until Sep 30", (_when, at) => {
    vi.setSystemTime(new Date(at))
    render(<WarrantyPanel item={item} homeId="h1" />)
    expect(screen.getByText("Active")).toBeInTheDocument()
    expect(screen.getByText("Covered until Sep 30, 2026")).toBeInTheDocument()
    expect(screen.queryByText("Lapsed")).not.toBeInTheDocument()
  })

  it("just after midnight (00:30 Oct 1): Lapsed, expired Sep 30", () => {
    vi.setSystemTime(new Date("2026-10-01T00:30:00-07:00"))
    render(<WarrantyPanel item={item} homeId="h1" />)
    expect(screen.getByText("Lapsed")).toBeInTheDocument()
    expect(screen.getByText("Expired Sep 30, 2026")).toBeInTheDocument()
  })
})

// A warranty entered as a length (24 months) with a purchase date and no end
// date: the panel said "Lapsed" while the Warranties list, which adds the
// months to the purchase date, said "Covered" (flow walk, 2026-11-24).
describe("WarrantyPanel — end date from purchase date + length", () => {
  const byLength = { ...item, purchase_date: "2025-10-20", warranty_expiry_date: null, warranty_duration_months: 24 } as unknown as ItemUnit

  it("is Active and covered until purchase + 24 months", () => {
    vi.setSystemTime(new Date("2026-11-24T10:00:00-08:00"))
    render(<WarrantyPanel item={byLength} homeId="h1" />)
    expect(screen.getByText("Active")).toBeInTheDocument()
    expect(screen.getByText("Covered until Oct 20, 2027")).toBeInTheDocument()
    expect(screen.queryByText("Lapsed")).not.toBeInTheDocument()
  })

  it("with no purchase date the end is unknown: no Active or Lapsed badge", () => {
    vi.setSystemTime(new Date("2026-11-24T10:00:00-08:00"))
    render(<WarrantyPanel item={{ ...byLength, purchase_date: null } as unknown as ItemUnit} homeId="h1" />)
    expect(screen.queryByText("Lapsed")).not.toBeInTheDocument()
    expect(screen.queryByText("Active")).not.toBeInTheDocument()
    expect(screen.getByText("24 month coverage")).toBeInTheDocument()
  })
})
