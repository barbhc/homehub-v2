import { describe, expect, it } from "vitest"
import { growthGateOn } from "./gate"

// The emulator suite (firebase/rules.test.ts "growth gate") proves the RULES
// behave this way; this pins the client/ops mirror to the same table, case for
// case, so the onboarding screen never shows "no code needed" for a create the
// rules will refuse.
describe("growthGateOn — fails closed, like firestore.rules", () => {
  it("is ON when config/growth does not exist", () => {
    expect(growthGateOn({ exists: false })).toBe(true)
  })

  it("is OFF only for an explicit boolean false", () => {
    expect(growthGateOn({ exists: true, inviteGateEnabled: false })).toBe(false)
  })

  it("is ON when the flag says so", () => {
    expect(growthGateOn({ exists: true, inviteGateEnabled: true })).toBe(true)
  })

  it("is ON when the doc exists but the field is missing", () => {
    expect(growthGateOn({ exists: true })).toBe(true)
    expect(growthGateOn({ exists: true, inviteGateEnabled: undefined })).toBe(true)
  })

  it("is ON for anything that merely looks like false", () => {
    for (const v of ["false", 0, null, "", "off"]) {
      expect(growthGateOn({ exists: true, inviteGateEnabled: v })).toBe(true)
    }
  })
})
