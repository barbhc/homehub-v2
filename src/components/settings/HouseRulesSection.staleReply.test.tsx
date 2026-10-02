/**
 * Settings › House rules: a late reply never lands on the wrong home (H4).
 *
 * The rules are read when the section opens and on a home switch. The read
 * applied whatever came back, so home A's slow read, answering after a switch
 * to home B, replaced B's rules with A's. And a switch kept showing A's rules
 * (or A's error) until B's arrived.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, render, screen } from "@testing-library/react"

const listHouseRules = vi.hoisted(() => vi.fn())
vi.mock("@/modules/care", () => ({
  listHouseRules: (...a: unknown[]) => listHouseRules(...a),
  deleteHouseRule: vi.fn(),
}))

const { HouseRulesSection } = await import("./HouseRulesSection")

type RulesRead = { data: { id: string; reason: string; createdAt: null }[] | null; error: { message: string } | null }
const rules = (reason: string): RulesRead => ({ data: [{ id: reason, reason, createdAt: null }], error: null })
const RULES: Record<string, RulesRead> = {
  "home-a": rules("Hide winterizing — the condo doesn't freeze"),
  "home-b": rules("Skip gutter cleaning — no gutters"),
}

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

beforeEach(() => {
  listHouseRules.mockReset()
  listHouseRules.mockImplementation(async (homeId: string) => RULES[homeId])
})

describe("HouseRulesSection — a late reply for the last home lands nowhere", () => {
  it("home A's slow read, answering after the switch to B, leaves B's rules", async () => {
    const slowA = deferred<RulesRead>()
    listHouseRules.mockImplementation((homeId: string) => (homeId === "home-a" ? slowA.promise : Promise.resolve(RULES[homeId])))
    const { rerender } = render(<HouseRulesSection homeId="home-a" />)

    rerender(<HouseRulesSection homeId="home-b" />)
    expect(await screen.findByText("Skip gutter cleaning — no gutters")).toBeInTheDocument()

    await act(async () => { slowA.resolve(RULES["home-a"]) })
    expect(screen.getByText("Skip gutter cleaning — no gutters")).toBeInTheDocument()
    expect(screen.queryByText("Hide winterizing — the condo doesn't freeze")).toBeNull()
  })

  it("a switch shows Loading, not the last home's rules, until the new home's arrive", async () => {
    const slowB = deferred<RulesRead>()
    listHouseRules.mockImplementation((homeId: string) => (homeId === "home-b" ? slowB.promise : Promise.resolve(RULES[homeId])))
    const { rerender } = render(<HouseRulesSection homeId="home-a" />)
    expect(await screen.findByText("Hide winterizing — the condo doesn't freeze")).toBeInTheDocument()

    rerender(<HouseRulesSection homeId="home-b" />)
    expect(screen.getByText("Loading…")).toBeInTheDocument()
    expect(screen.queryByText("Hide winterizing — the condo doesn't freeze")).toBeNull()

    await act(async () => { slowB.resolve(RULES["home-b"]) })
    expect(screen.getByText("Skip gutter cleaning — no gutters")).toBeInTheDocument()
  })

  it("the last home's failed read is not said on the next home", async () => {
    listHouseRules.mockImplementation(async (homeId: string) =>
      homeId === "home-a" ? { data: null, error: { message: "Couldn't load your house rules." } } : RULES[homeId])
    const { rerender } = render(<HouseRulesSection homeId="home-a" />)
    expect(await screen.findByText("Couldn't load your house rules.")).toBeInTheDocument()

    rerender(<HouseRulesSection homeId="home-b" />)
    expect(await screen.findByText("Skip gutter cleaning — no gutters")).toBeInTheDocument()
    expect(screen.queryByText("Couldn't load your house rules.")).toBeNull()
  })
})
