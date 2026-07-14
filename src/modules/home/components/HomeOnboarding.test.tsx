/**
 * HomeOnboarding anti-stray-home regression: when the "do I already have a
 * home?" pre-check FAILS, submitting must NOT call createHome (during the
 * launch incident this guard fell through and minted a duplicate home).
 */
import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { HomeOnboarding } from "./HomeOnboarding"

const getPrimaryHome = vi.fn()
const createHome = vi.fn()
vi.mock("../services/homeService", () => ({
  getPrimaryHome: (...a: unknown[]) => getPrimaryHome(...a),
  createHome: (...a: unknown[]) => createHome(...a),
}))
vi.mock("@/modules/auth", () => ({
  useAuth: () => ({ user: { id: "uid-1", email: "t@t.t", user_metadata: {} }, loading: false }),
}))

beforeEach(() => {
  getPrimaryHome.mockReset()
  createHome.mockReset()
})

async function submitWithName(name = "My Place") {
  fireEvent.change(screen.getByPlaceholderText(/My House/i), { target: { value: name } })
  fireEvent.click(screen.getByRole("button", { name: /continue/i }))
}

describe("HomeOnboarding duplicate-home guard", () => {
  it("pre-check ERROR → hard stop: shows error, never calls createHome", async () => {
    getPrimaryHome.mockResolvedValue({ data: null, error: { message: "query failed" } })
    const onComplete = vi.fn()
    render(<HomeOnboarding onComplete={onComplete} />)
    await submitWithName()
    await waitFor(() => expect(screen.getByText(/couldn't check your account/i)).toBeInTheDocument())
    expect(createHome).not.toHaveBeenCalled()
    expect(onComplete).not.toHaveBeenCalled()
  })

  it("existing home → completes without creating another", async () => {
    getPrimaryHome.mockResolvedValue({
      data: { home_id: "h1", name: "SF Condo", timezone: "", created_at: "", updated_at: "", deleted_at: null },
      error: null,
    })
    const onComplete = vi.fn()
    render(<HomeOnboarding onComplete={onComplete} />)
    await submitWithName()
    await waitFor(() => expect(onComplete).toHaveBeenCalled())
    expect(createHome).not.toHaveBeenCalled()
  })

  it("genuinely no home → creates one", async () => {
    getPrimaryHome.mockResolvedValue({ data: null, error: null })
    createHome.mockResolvedValue({ data: { homeId: "h-new" }, error: null })
    const onComplete = vi.fn()
    render(<HomeOnboarding onComplete={onComplete} />)
    await submitWithName()
    await waitFor(() => expect(onComplete).toHaveBeenCalled())
    expect(createHome).toHaveBeenCalledOnce()
  })
})
