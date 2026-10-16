/**
 * The add button says why it is disabled (audit 2026-10-15). It used to sit
 * greyed out under a half-filled form with no reason — a one-letter brand, or
 * a brand with no model — and nothing on the screen said which.
 */
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { IdentifyStep, type IdentifyData, type IdentifyMode } from "./IdentifyStep"
import { DEFAULT_IDENTIFY_DATA, missingToAdd } from "./identifyData"

vi.mock("@/modules/home", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useCurrentHome: () => ({ home: { home_id: "home-1", name: "Test Home" } }),
  getRooms: async () => ({ data: [], error: null }),
}))
vi.mock("@/modules/inventory/services/productLookupService", () => ({
  lookupProduct: async () => ({ data: null, error: null }),
  lookupBrandForModel: async () => null,
}))

function Step({ mode, data }: { mode: IdentifyMode; data: IdentifyData }) {
  return (
    <IdentifyStep
      mode={mode} data={data} onModeChange={vi.fn()} onDataChange={vi.fn()}
      onConfirm={vi.fn()} isCreating={false} error={null}
    />
  )
}

const cta = () => screen.getByRole("button", { name: "Add the manual" })

describe("IdentifyStep — a disabled add button says what is missing", () => {
  it("brand typed, no model: names the model", () => {
    render(<Step mode="appliance" data={{ ...DEFAULT_IDENTIFY_DATA, brand: "LG" }} />)
    expect(cta()).toBeDisabled()
    expect(screen.getByText("Add the model to continue.")).toBeInTheDocument()
    expect(cta()).toHaveAccessibleDescription("Add the model to continue.")
  })

  it("a one-letter brand: says it needs two", () => {
    render(<Step mode="appliance" data={{ ...DEFAULT_IDENTIFY_DATA, brand: "L", model: "WM4000" }} />)
    expect(screen.getByText("The brand needs at least 2 letters.")).toBeInTheDocument()
  })

  it("the untouched screen adds no line — its empty fields already ask", () => {
    render(<Step mode="appliance" data={DEFAULT_IDENTIFY_DATA} />)
    expect(cta()).toBeDisabled()
    expect(screen.queryByText(/to continue\./)).toBeNull()
  })

  it("a complete form: enabled, no line", () => {
    render(<Step mode="appliance" data={{ ...DEFAULT_IDENTIFY_DATA, brand: "LG", model: "WM4000" }} />)
    expect(cta()).toBeEnabled()
    expect(screen.queryByText(/to continue\./)).toBeNull()
  })
})

describe("missingToAdd — the one rule for enabling the button", () => {
  const d = (p: Partial<IdentifyData>) => ({ ...DEFAULT_IDENTIFY_DATA, ...p })
  it("appliance lane needs brand (2+) and model, never a name", () => {
    expect(missingToAdd("appliance", d({}))).toBe("Add the brand and model to continue.")
    expect(missingToAdd("appliance", d({ model: "X1" }))).toBe("Add the brand to continue.")
    expect(missingToAdd("appliance", d({ brand: "LG", model: " " }))).toBe("Add the model to continue.")
    expect(missingToAdd("appliance", d({ brand: "LG", model: "X1" }))).toBeNull()
  })
  it("simple lane needs a name", () => {
    expect(missingToAdd("simple", d({ name: "  " }))).toBe("Add a name to continue.")
    expect(missingToAdd("simple", d({ name: "Shop vac" }))).toBeNull()
  })
})
