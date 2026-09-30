/**
 * The onboarding screen's reading of the invite gate must match the rules'.
 *
 * firestore.rules now FAILS CLOSED: with config/growth missing, creating a home
 * needs an admission. The screen used to read a missing doc as "gate off" and
 * hide the code field — so a new user would type a home name, press Continue,
 * and get a bare permission error with no way to enter the code the rules were
 * waiting for.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const docs: Record<string, { exists: boolean; data?: Record<string, unknown> } | Error> = {}

vi.mock("firebase/firestore", () => ({
  doc: vi.fn((_db: unknown, path: string) => ({ path })),
  getDoc: vi.fn(async (ref: { path: string }) => {
    const d = docs[ref.path] ?? { exists: false }
    if (d instanceof Error) throw d
    return { exists: () => d.exists, get: (k: string) => (d.exists ? d.data?.[k] : undefined) }
  }),
}))
vi.mock("@/integrations/firebase", () => ({ db: {}, callable: () => vi.fn() }))

import { getGateStatus } from "./growthGate"

beforeEach(() => {
  for (const k of Object.keys(docs)) delete docs[k]
})

describe("getGateStatus reads the gate the way the rules do", () => {
  it("config/growth missing → gate ON (the code field shows)", async () => {
    expect(await getGateStatus("uid-1")).toEqual({ gateOn: true, admitted: false })
  })

  it("explicit inviteGateEnabled:false → gate OFF", async () => {
    docs["config/growth"] = { exists: true, data: { inviteGateEnabled: false } }
    expect(await getGateStatus("uid-1")).toEqual({ gateOn: false, admitted: false })
  })

  it("gate ON but already admitted → no code needed", async () => {
    docs["config/growth"] = { exists: true, data: { inviteGateEnabled: true } }
    docs["admissions/uid-1"] = { exists: true, data: { code: "X" } }
    expect(await getGateStatus("uid-1")).toEqual({ gateOn: true, admitted: true })
  })

  it("a READ ERROR still shows the plain form (presentation fallback; the rules still decide)", async () => {
    docs["config/growth"] = new Error("unavailable")
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(await getGateStatus("uid-1")).toEqual({ gateOn: false, admitted: false })
    warn.mockRestore()
  })
})
