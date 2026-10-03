/**
 * The home switcher always reopens on the list.
 *
 * Its reset used to be setState in an effect keyed on `open`; H5 (the
 * whole-app lint) makes it in the render that opens the sheet. Pinned: closing
 * mid-add and reopening shows the list — not the half-typed form, and not the
 * error from the last attempt.
 */
import { describe, it, expect, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { Home } from "@/integrations/types"

const createHome = vi.hoisted(() => vi.fn())
vi.mock("@/modules/home", () => ({ createHome: (...a: unknown[]) => createHome(...a) }))

const { HomeSwitcherSheet } = await import("./HomeSwitcherSheet")

const HOMES = [{ home_id: "h1", name: "SF Condo" }] as Home[]

function Sheet({ open }: { open: boolean }) {
  return (
    <HomeSwitcherSheet
      open={open} onOpenChange={vi.fn()} homes={HOMES} currentHomeId="h1" userId="u1"
      onSelect={vi.fn()} onCreated={vi.fn()}
    />
  )
}

describe("HomeSwitcherSheet", () => {
  it("reopens on the list, with the half-typed name and the old error gone", async () => {
    createHome.mockResolvedValue({ data: null, error: { message: "Couldn't reach the server." } })
    const { rerender } = render(<Sheet open />)

    fireEvent.click(screen.getByRole("button", { name: /Add a home/ }))
    fireEvent.change(screen.getByLabelText("Home name"), { target: { value: "Lake cabin" } })
    fireEvent.click(screen.getByRole("button", { name: "Add home" }))
    await waitFor(() => expect(screen.getByText("Couldn't reach the server.")).toBeInTheDocument())

    rerender(<Sheet open={false} />)
    rerender(<Sheet open />)

    expect(screen.getByText("Your homes")).toBeInTheDocument()
    expect(screen.queryByLabelText("Home name")).toBeNull()
    // And the form starts empty when it is opened again.
    fireEvent.click(screen.getByRole("button", { name: /Add a home/ }))
    expect(screen.getByLabelText("Home name")).toHaveValue("")
    expect(screen.queryByText("Couldn't reach the server.")).toBeNull()
  })
})
