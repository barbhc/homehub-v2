/**
 * HomeProvider contract. Two things are pinned here:
 *
 *  1. The launch-incident regression: a FAILED home lookup must surface `error`
 *     and must NOT read as "user has no home" — that misreading is what minted
 *     duplicate homes.
 *  2. Multi-home selection: which home is selected, that switching persists,
 *     and that a stored selection the user no longer belongs to corrects itself.
 */
import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen, waitFor, act } from "@testing-library/react"
import { HomeProvider, useCurrentHome } from "./HomeProvider"

const getMyHomes = vi.fn()
vi.mock("../services/homeService", () => ({
  getMyHomes: () => getMyHomes(),
}))
vi.mock("@/modules/auth", () => ({
  useAuth: () => ({ user: { id: "uid-1", email: "t@t.t", user_metadata: {} }, loading: false }),
}))

const CACHE_KEY = "homehub:primary-home"
const mkHome = (id: string, name: string, created = "2026-01-01T00:00:00.000Z") => ({
  home_id: id,
  name,
  timezone: "America/Los_Angeles",
  created_at: created,
  updated_at: created,
  deleted_at: null,
})

function Probe() {
  const { home, homes, homesReady, loading, error, refresh, setCurrentHome } = useCurrentHome()
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="ready">{String(homesReady)}</span>
      <span data-testid="home">{home?.name ?? "none"}</span>
      <span data-testid="homes">{homes.map((h) => h.name).join(",") || "none"}</span>
      <span data-testid="error">{error ?? "none"}</span>
      <button onClick={() => void refresh()}>retry</button>
      <button onClick={() => void refresh("h2")}>select-h2</button>
      <button onClick={() => setCurrentHome("h2")}>switch-h2</button>
      <button onClick={() => setCurrentHome("nope")}>switch-unknown</button>
    </div>
  )
}

const renderProvider = () =>
  render(
    <HomeProvider>
      <Probe />
    </HomeProvider>
  )

beforeEach(() => {
  getMyHomes.mockReset()
  localStorage.clear()
})

describe("HomeProvider error contract", () => {
  it("a failed lookup exposes error (and is NOT treated as 'no home')", async () => {
    getMyHomes.mockResolvedValue({ data: null, error: { message: "index missing" } })
    renderProvider()
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"))
    expect(screen.getByTestId("error").textContent).toBe("index missing")
    expect(screen.getByTestId("home").textContent).toBe("none")
  })

  it("refresh clears the error once the lookup succeeds", async () => {
    getMyHomes.mockResolvedValueOnce({ data: null, error: { message: "boom" } })
    renderProvider()
    await waitFor(() => expect(screen.getByTestId("error").textContent).toBe("boom"))

    getMyHomes.mockResolvedValue({
      data: { homes: [mkHome("h1", "SF Condo")], primaryHomeId: "h1" },
      error: null,
    })
    await act(async () => {
      screen.getByText("retry").click()
    })
    await waitFor(() => expect(screen.getByTestId("home").textContent).toBe("SF Condo"))
    expect(screen.getByTestId("error").textContent).toBe("none")
  })

  it("a clean empty result means genuinely no home (error stays null)", async () => {
    getMyHomes.mockResolvedValue({ data: { homes: [], primaryHomeId: null }, error: null })
    renderProvider()
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"))
    expect(screen.getByTestId("error").textContent).toBe("none")
    expect(screen.getByTestId("home").textContent).toBe("none")
  })

  it("a failed lookup does not blank a home already painted from cache", async () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ uid: "uid-1", home: mkHome("h1", "My House"), at: "" }))
    getMyHomes.mockResolvedValue({ data: null, error: { message: "offline" } })
    renderProvider()
    await waitFor(() => expect(screen.getByTestId("error").textContent).toBe("offline"))
    expect(screen.getByTestId("home").textContent).toBe("My House")
  })

  it("marks homesReady even when the lookup fails, so a deep link can stop waiting", async () => {
    getMyHomes.mockResolvedValue({ data: null, error: { message: "offline" } })
    renderProvider()
    await waitFor(() => expect(screen.getByTestId("ready").textContent).toBe("true"))
  })
})

describe("HomeProvider multi-home selection", () => {
  const two = {
    data: { homes: [mkHome("h1", "My House"), mkHome("h2", "Parents SF")], primaryHomeId: "h1" },
    error: null,
  }

  it("paints the cached home before the network answers, and seeds the list with it", async () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ uid: "uid-1", home: mkHome("h2", "Parents SF"), at: "" }))
    let resolve!: (v: unknown) => void
    getMyHomes.mockReturnValue(new Promise((r) => { resolve = r }))
    renderProvider()
    // Pre-network: cache decides what paints first.
    expect(screen.getByTestId("home").textContent).toBe("Parents SF")
    expect(screen.getByTestId("homes").textContent).toBe("Parents SF")
    await act(async () => { resolve(two) })
    await waitFor(() => expect(screen.getByTestId("homes").textContent).toBe("My House,Parents SF"))
  })

  it("the device's last selection outranks the membership primary", async () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ uid: "uid-1", home: mkHome("h2", "Parents SF"), at: "" }))
    getMyHomes.mockResolvedValue(two)
    renderProvider()
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"))
    expect(screen.getByTestId("home").textContent).toBe("Parents SF")
  })

  it("falls back to the primary when nothing is stored", async () => {
    getMyHomes.mockResolvedValue(two)
    renderProvider()
    await waitFor(() => expect(screen.getByTestId("home").textContent).toBe("My House"))
  })

  it("falls back to the first home when there is no primary either", async () => {
    getMyHomes.mockResolvedValue({
      data: { homes: [mkHome("h1", "My House"), mkHome("h2", "Parents SF")], primaryHomeId: null },
      error: null,
    })
    renderProvider()
    await waitFor(() => expect(screen.getByTestId("home").textContent).toBe("My House"))
  })

  it("corrects a stored selection the user no longer belongs to", async () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ uid: "uid-1", home: mkHome("gone", "Removed Home"), at: "" }))
    getMyHomes.mockResolvedValue(two)
    renderProvider()
    // Stale paint first, then the server answer wins and rewrites the cache.
    expect(screen.getByTestId("home").textContent).toBe("Removed Home")
    await waitFor(() => expect(screen.getByTestId("home").textContent).toBe("My House"))
    expect(JSON.parse(localStorage.getItem(CACHE_KEY)!).home.home_id).toBe("h1")
  })

  it("setCurrentHome switches and persists the choice", async () => {
    getMyHomes.mockResolvedValue(two)
    renderProvider()
    await waitFor(() => expect(screen.getByTestId("home").textContent).toBe("My House"))
    await act(async () => { screen.getByText("switch-h2").click() })
    expect(screen.getByTestId("home").textContent).toBe("Parents SF")
    expect(JSON.parse(localStorage.getItem(CACHE_KEY)!).home.home_id).toBe("h2")
  })

  it("setCurrentHome ignores a home the user doesn't belong to", async () => {
    getMyHomes.mockResolvedValue(two)
    renderProvider()
    await waitFor(() => expect(screen.getByTestId("home").textContent).toBe("My House"))
    await act(async () => { screen.getByText("switch-unknown").click() })
    expect(screen.getByTestId("home").textContent).toBe("My House")
  })

  it("refresh(selectHomeId) selects a home that wasn't loaded yet — the just-created case", async () => {
    getMyHomes.mockResolvedValueOnce({
      data: { homes: [mkHome("h1", "My House")], primaryHomeId: "h1" },
      error: null,
    })
    renderProvider()
    await waitFor(() => expect(screen.getByTestId("home").textContent).toBe("My House"))

    getMyHomes.mockResolvedValue(two)
    await act(async () => { screen.getByText("select-h2").click() })
    await waitFor(() => expect(screen.getByTestId("home").textContent).toBe("Parents SF"))
  })
})
