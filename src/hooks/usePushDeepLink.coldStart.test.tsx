/**
 * A notification tap for ANOTHER home, through the real HomeProvider (H4).
 *
 * usePushDeepLink.test.tsx pins the hook's decisions against a mocked home
 * context. That could not catch this: on a cold start the tap is parked before
 * React mounts, held until the homes list lands, then followed — and the hook
 * runs its effect BEFORE the provider's own effects in that commit (children's
 * effects run first). The provider kept the list setCurrentHome looks in
 * (homesRef) in sync from one of those effects, so at the moment the push
 * asked to switch, the list was still the one from before the lookup: the
 * switch silently missed and the task opened under the old home.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom"

const getMyHomes = vi.hoisted(() => vi.fn())
vi.mock("@/modules/home/services/homeService", () => ({ getMyHomes: () => getMyHomes() }))
vi.mock("@/modules/auth", () => ({
  useAuth: () => ({ user: { id: "uid-1", email: "t@t.t", user_metadata: {} }, loading: false }),
}))
// The hook reads the home context from the module's index; hand it the REAL
// provider's, without loading every service the index re-exports.
vi.mock("@/modules/home", async () => {
  const real = await import("@/modules/home/components/HomeProvider")
  return { HomeProvider: real.HomeProvider, useCurrentHome: real.useCurrentHome }
})

const { HomeProvider, useCurrentHome } = await import("@/modules/home")
const { usePushDeepLink } = await import("./usePushDeepLink")
const { parkDeepLink } = await import("@/lib/pushDeepLink")

const CACHE_KEY = "homehub:primary-home"
const PARKED_KEY = "homehub:pending-deeplink"
const mkHome = (id: string, name: string) => ({
  home_id: id,
  name,
  timezone: "America/Los_Angeles",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  deleted_at: null,
})
const TWO_HOMES = {
  data: { homes: [mkHome("h1", "My House"), mkHome("h2", "Parents SF")], primaryHomeId: "h1" },
  error: null,
}

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

function PushDeepLinks() {
  usePushDeepLink()
  return null
}
function Where() {
  const { home } = useCurrentHome()
  const { pathname, search } = useLocation()
  return (
    <div>
      <span data-testid="home">{home?.name ?? "none"}</span>
      <span data-testid="at">{pathname + search}</span>
    </div>
  )
}
const renderApp = () =>
  render(
    <MemoryRouter initialEntries={["/home"]}>
      <HomeProvider>
        <PushDeepLinks />
        <Routes>
          <Route path="*" element={<Where />} />
        </Routes>
      </HomeProvider>
    </MemoryRouter>,
  )

beforeEach(() => {
  getMyHomes.mockReset()
  localStorage.clear()
  sessionStorage.clear()
})

describe("a push tap for another home lands on that home", () => {
  it("COLD start, warm cache: the tap parked before mount switches to the push's home once the list lands", async () => {
    // Last session was in My House; the tap is about a task in Parents SF.
    localStorage.setItem(CACHE_KEY, JSON.stringify({ uid: "uid-1", home: mkHome("h1", "My House"), at: "" }))
    sessionStorage.setItem(PARKED_KEY, "/tasks/t-parents?home=h2")
    const lookup = deferred<typeof TWO_HOMES>()
    getMyHomes.mockReturnValue(lookup.promise)

    renderApp()
    // Cache paints first; the tap waits for the real list.
    expect(screen.getByTestId("home").textContent).toBe("My House")
    expect(screen.getByTestId("at").textContent).toBe("/home")

    await act(async () => { lookup.resolve(TWO_HOMES) })

    await waitFor(() => expect(screen.getByTestId("at").textContent).toBe("/tasks/t-parents?home=h2"))
    expect(screen.getByTestId("home").textContent).toBe("Parents SF")
    // And it stays — nothing later puts the old home back.
    await act(async () => {})
    expect(screen.getByTestId("home").textContent).toBe("Parents SF")
    expect(JSON.parse(localStorage.getItem(CACHE_KEY)!).home.home_id).toBe("h2")
  })

  it("COLD start, first launch on this device (no cache): it still switches to the push's home", async () => {
    sessionStorage.setItem(PARKED_KEY, "/tasks/t-parents?home=h2")
    const lookup = deferred<typeof TWO_HOMES>()
    getMyHomes.mockReturnValue(lookup.promise)

    renderApp()
    await act(async () => { lookup.resolve(TWO_HOMES) })

    await waitFor(() => expect(screen.getByTestId("at").textContent).toBe("/tasks/t-parents?home=h2"))
    expect(screen.getByTestId("home").textContent).toBe("Parents SF")
  })

  it("WARM tap (app already open, list loaded): switches and follows, as before", async () => {
    getMyHomes.mockResolvedValue(TWO_HOMES)
    renderApp()
    await waitFor(() => expect(screen.getByTestId("home").textContent).toBe("My House"))

    act(() => { parkDeepLink("/tasks/t-warm?home=h2") })

    await waitFor(() => expect(screen.getByTestId("at").textContent).toBe("/tasks/t-warm?home=h2"))
    expect(screen.getByTestId("home").textContent).toBe("Parents SF")
  })

  it("a cold-start tap for the home already cached just opens it", async () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ uid: "uid-1", home: mkHome("h1", "My House"), at: "" }))
    sessionStorage.setItem(PARKED_KEY, "/tasks/t-mine?home=h1")
    getMyHomes.mockResolvedValue(TWO_HOMES)

    renderApp()
    await waitFor(() => expect(screen.getByTestId("at").textContent).toBe("/tasks/t-mine?home=h1"))
    expect(screen.getByTestId("home").textContent).toBe("My House")
  })
})
