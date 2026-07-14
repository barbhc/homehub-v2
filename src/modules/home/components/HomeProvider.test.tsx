/**
 * HomeProvider error-path contract (launch-incident regression): a FAILED home
 * lookup must surface `error` and must NOT read as "user has no home".
 */
import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen, waitFor, act } from "@testing-library/react"
import { HomeProvider, useCurrentHome } from "./HomeProvider"

const getPrimaryHome = vi.fn()
vi.mock("../services/homeService", () => ({
  getPrimaryHome: () => getPrimaryHome(),
}))
vi.mock("@/modules/auth", () => ({
  useAuth: () => ({ user: { id: "uid-1", email: "t@t.t", user_metadata: {} }, loading: false }),
}))

function Probe() {
  const { home, loading, error, refresh } = useCurrentHome()
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="home">{home?.name ?? "none"}</span>
      <span data-testid="error">{error ?? "none"}</span>
      <button onClick={() => void refresh()}>retry</button>
    </div>
  )
}

beforeEach(() => {
  getPrimaryHome.mockReset()
})

describe("HomeProvider error contract", () => {
  it("a failed lookup exposes error (and is NOT treated as 'no home')", async () => {
    getPrimaryHome.mockResolvedValue({ data: null, error: { message: "index missing" } })
    render(
      <HomeProvider>
        <Probe />
      </HomeProvider>
    )
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"))
    expect(screen.getByTestId("error").textContent).toBe("index missing")
    expect(screen.getByTestId("home").textContent).toBe("none")
  })

  it("refresh clears the error once the lookup succeeds", async () => {
    getPrimaryHome.mockResolvedValueOnce({ data: null, error: { message: "boom" } })
    render(
      <HomeProvider>
        <Probe />
      </HomeProvider>
    )
    await waitFor(() => expect(screen.getByTestId("error").textContent).toBe("boom"))

    getPrimaryHome.mockResolvedValue({
      data: { home_id: "h1", name: "SF Condo", timezone: "America/Los_Angeles", created_at: "", updated_at: "", deleted_at: null },
      error: null,
    })
    await act(async () => {
      screen.getByText("retry").click()
    })
    await waitFor(() => expect(screen.getByTestId("home").textContent).toBe("SF Condo"))
    expect(screen.getByTestId("error").textContent).toBe("none")
  })

  it("a clean empty result means genuinely no home (error stays null)", async () => {
    getPrimaryHome.mockResolvedValue({ data: null, error: null })
    render(
      <HomeProvider>
        <Probe />
      </HomeProvider>
    )
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"))
    expect(screen.getByTestId("error").textContent).toBe("none")
    expect(screen.getByTestId("home").textContent).toBe("none")
  })
})
