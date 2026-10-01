/**
 * The simple lane's "Add more details" opens itself when autofill lands in a
 * field it hides — and only then.
 *
 * Restructured for the whole-app lint (H5): the open used to be setState in an
 * effect keyed on `wantAutoExpand`, and is now made in the render that changes
 * it (useDepsChanged). What must hold either way:
 *  - hidden autofill already there on arrival opens it (the effect's mount run);
 *  - autofill arriving later opens it;
 *  - closing it is the user's call: it is not reopened while the same autofill
 *    is still there.
 */
import { describe, it, expect, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { IdentifyStep, type IdentifyData } from "./IdentifyStep"
import { DEFAULT_IDENTIFY_DATA } from "./identifyData"

vi.mock("@/modules/home", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useCurrentHome: () => ({ home: { home_id: "home-1", name: "Test Home" } }),
  getRooms: async () => ({ data: [], error: null }),
}))
vi.mock("@/modules/inventory/services/productLookupService", () => ({
  lookupProduct: async () => ({ data: null, error: null }),
  lookupBrandForModel: async () => null,
}))

function Step({ data }: { data: IdentifyData }) {
  return (
    <IdentifyStep
      mode="simple" data={data} onModeChange={vi.fn()} onDataChange={vi.fn()}
      onConfirm={vi.fn()} isCreating={false} error={null}
    />
  )
}

const empty: IdentifyData = { ...DEFAULT_IDENTIFY_DATA, name: "Shop vac" }
const withSerial: IdentifyData = { ...empty, serialNumber: "SN-1234" }

const isOpen = () => screen.queryByRole("button", { name: /Hide extra details/ }) !== null

describe("IdentifyStep · simple lane auto-expand", () => {
  it("starts closed with nothing hidden filled in", () => {
    render(<Step data={empty} />)
    expect(isOpen()).toBe(false)
    expect(screen.getByRole("button", { name: /Add more details/ })).toBeInTheDocument()
  })

  it("opens on arrival when a hidden field already holds autofill", () => {
    render(<Step data={withSerial} />)
    expect(isOpen()).toBe(true)
  })

  it("opens when autofill lands later, and stays closed once the user closes it", () => {
    const { rerender } = render(<Step data={empty} />)
    expect(isOpen()).toBe(false)

    rerender(<Step data={withSerial} />)
    expect(isOpen()).toBe(true)

    fireEvent.click(screen.getByRole("button", { name: /Hide extra details/ }))
    expect(isOpen()).toBe(false)
    // Same autofill, another render (a keystroke elsewhere): not reopened.
    rerender(<Step data={{ ...withSerial, name: "Shop vac 2" }} />)
    expect(isOpen()).toBe(false)
  })
})
