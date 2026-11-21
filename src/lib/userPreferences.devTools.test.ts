import { beforeEach, describe, expect, it, vi } from "vitest"

const m = vi.hoisted(() => ({ data: undefined as Record<string, unknown> | undefined }))
vi.mock("@/integrations/firebase", () => ({ db: {} }))
vi.mock("firebase/firestore", () => ({
  doc: vi.fn(),
  getDoc: vi.fn(async () => ({ exists: () => m.data !== undefined, data: () => m.data })),
  serverTimestamp: vi.fn(),
  writeBatch: vi.fn(),
}))

const { getDevToolsEnabled } = await import("./userPreferences")

describe("getDevToolsEnabled", () => {
  beforeEach(() => {
    m.data = undefined
  })

  it("is on only for a stored boolean true", async () => {
    m.data = { dev_tools: true }
    expect(await getDevToolsEnabled("u")).toBe(true)
  })

  it.each([
    ["no prefs doc", undefined],
    ["the field absent", {}],
    ["false", { dev_tools: false }],
    ["the string \"true\"", { dev_tools: "true" }],
    ["1", { dev_tools: 1 }],
    ["an object", { dev_tools: { on: true } }],
  ])("is off for %s", async (_label, data) => {
    m.data = data as Record<string, unknown> | undefined
    expect(await getDevToolsEnabled("u")).toBe(false)
  })
})
