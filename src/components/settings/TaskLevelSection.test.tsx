/**
 * D4 — Settings › Task level, mock screen 2 (approved 2026-11-20). Each test is
 * a line of that screen's "Must be true when it is built".
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import type { TaskLevel } from "../../../shared/tasks/taskLevel"

const setTaskLevel = vi.fn()
const refresh = vi.fn().mockResolvedValue(undefined)
let stored: TaskLevel | null = null
let loadFails = false

vi.mock("@/modules/care/services/taskLevelService", () => ({ setTaskLevel: (...a: unknown[]) => setTaskLevel(...a) }))
vi.mock("@/modules/home", () => ({
  useHomeProfile: () => ({
    profile: loadFails ? null : { task_level: stored },
    isLoading: false,
    error: loadFails ? new Error("offline") : undefined,
    refresh,
  }),
}))

const { TaskLevelSection } = await import("./TaskLevelSection")

const card = () => render(<MemoryRouter><TaskLevelSection homeId="h1" /></MemoryRouter>)
const option = (name: RegExp) => screen.getByRole("button", { name })

beforeEach(() => {
  setTaskLevel.mockReset()
  refresh.mockClear()
  stored = null
  loadFails = false
})

describe("Settings › Task level", () => {
  it("lists three choices, least to most", () => {
    card()
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Essential onlySafety and preventing damage",
      "Recommended tooAdds upkeep that makes things last",
      "EverythingAll suggested upkeep, optional included",
    ])
  })

  it("a home that existed before this shows Everything selected — that is how it behaves", () => {
    stored = null
    card()
    expect(option(/^Everything/)).toHaveAttribute("aria-pressed", "true")
    expect(option(/^Recommended too/)).toHaveAttribute("aria-pressed", "false")
  })

  it("shows the level a home chose (a new home is created on Recommended too)", () => {
    stored = "recommended"
    card()
    expect(option(/^Recommended too/)).toHaveAttribute("aria-pressed", "true")
  })

  it("picking a level saves it for the home and refetches what it changes", async () => {
    stored = "recommended"
    setTaskLevel.mockResolvedValue({ data: { hidden: 3, shown: 0 }, error: null })
    card()
    fireEvent.click(option(/^Essential only/))
    await waitFor(() => expect(setTaskLevel).toHaveBeenCalledWith("h1", "essential"))
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it("if saving fails, the old choice stays selected and an error shows", async () => {
    stored = "recommended"
    setTaskLevel.mockResolvedValue({ data: null, error: { message: "Couldn't save your choice. Check your connection and try again." } })
    card()
    fireEvent.click(option(/^Essential only/))
    expect(await screen.findByText("Couldn't save your choice. Check your connection and try again.")).toBeInTheDocument()
    expect(option(/^Recommended too/)).toHaveAttribute("aria-pressed", "true")
    expect(option(/^Essential only/)).toHaveAttribute("aria-pressed", "false")
    expect(refresh).not.toHaveBeenCalled()
  })

  it("picking the level already selected writes nothing", () => {
    stored = "essential"
    card()
    fireEvent.click(option(/^Essential only/))
    expect(setTaskLevel).not.toHaveBeenCalled()
  })

  it("says it deletes nothing", () => {
    card()
    expect(screen.getByText("This changes what shows. Nothing is deleted.")).toBeInTheDocument()
  })

  it("when the level cannot be read, nothing is shown as selected and nothing can be picked", () => {
    loadFails = true
    card()
    for (const b of screen.getAllByRole("button")) {
      expect(b).toBeDisabled()
      expect(b).toHaveAttribute("aria-pressed", "false")
    }
    expect(screen.getByText(/Couldn't load this home's task level/)).toBeInTheDocument()
  })
})
