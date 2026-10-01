/**
 * The Providers directory's selection: the first provider by default, and
 * always one that is still in the list.
 *
 * It was kept valid by an effect that set state a render later (H5,
 * react-hooks/set-state-in-effect); it is now corrected in the render that
 * sees the list change. Pinned: the first provider is open on arrival;
 * choosing another opens it; when the open one leaves the list, the first is
 * opened; an empty list opens nothing.
 */
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import type { ServiceProvider } from "@/integrations/types"

const hook = vi.hoisted(() => ({ providers: [] as ServiceProvider[] }))
vi.mock("@/modules/home", () => ({ useCurrentHome: () => ({ home: { home_id: "home-1" } }) }))
vi.mock("@/hooks/useServiceProviders", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useServiceProviders: () => ({
    providers: hook.providers, loading: false, deletingId: null, loadFailed: false, removeError: null,
    save: vi.fn(), remove: vi.fn(), reload: vi.fn(),
  }),
}))

const { default: ProvidersPage } = await import("./ProvidersPage")

const provider = (provider_id: string, name: string, category = "plumber") =>
  ({ provider_id, home_id: "home-1", name, category, phone: null, email: null, website: null, notes: null }) as ServiceProvider

const page = () => (
  <MemoryRouter>
    <ProvidersPage />
  </MemoryRouter>
)
/** The detail pane's heading names the open provider. */
const openProvider = () => screen.queryByRole("heading", { level: 2 })?.textContent ?? null

describe("ProvidersPage · which provider is open", () => {
  it("opens the first, follows a choice, falls back to the first when the open one goes, and opens nothing when empty", () => {
    hook.providers = [provider("p1", "Ace Plumbing"), provider("p2", "Bay Drains")]
    const { rerender } = render(page())
    expect(openProvider()).toBe("Ace Plumbing")

    fireEvent.click(screen.getByRole("button", { name: /Bay Drains/ }))
    expect(openProvider()).toBe("Bay Drains")

    hook.providers = [provider("p1", "Ace Plumbing"), provider("p3", "City Rooter")]
    rerender(page())
    expect(openProvider()).toBe("Ace Plumbing")

    hook.providers = []
    rerender(page())
    // The empty state's own heading, not a provider's.
    expect(openProvider()).toBe("No service providers yet")
  })
})
