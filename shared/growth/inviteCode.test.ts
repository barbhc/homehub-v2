import { describe, it, expect } from "vitest"
import { decideRedeem, generateCode, messageFor, normalizeCode } from "./inviteCode.js"

describe("normalizeCode", () => {
  it("treats the ways a person actually types a code as the same code", () => {
    // Read off one phone, typed into another. If these diverge, the gate's main
    // observable effect is support email.
    for (const typed of ["homehub-2026", "HOMEHUB 2026", " homehub2026 ", "Homehub_2026"]) {
      expect(normalizeCode(typed)).toBe("HOMEHUB2026")
    }
  })
})

describe("generateCode", () => {
  it("drops one glyph from each confusable pair", () => {
    // O/0, I/1/L, S/5, B/8 are the reliable mistypes, and a code carrying one
    // costs a round trip every time it is shared. Only ONE side of each pair is
    // dropped — losing both would shrink the alphabet for no gain.
    let seq = 0
    const code = generateCode(400, () => (seq++ % 28) / 28)
    expect(code).not.toMatch(/[OILSB015]/)
    // …and the surviving halves are still available.
    expect(code).toMatch(/8/)
  })

  it("is the requested length", () => {
    expect(generateCode(8)).toHaveLength(8)
  })
})

describe("decideRedeem", () => {
  const NOW = 1_700_000_000_000
  const live = { uses: 0, maxUses: 5, expiresAt: NOW + 86_400_000, disabled: false }

  it("admits a live code", () => {
    expect(decideRedeem("ABCD2345", live, NOW)).toEqual({ ok: true })
  })

  it("refuses a code that does not exist", () => {
    expect(decideRedeem("ABCD2345", null, NOW)).toEqual({ ok: false, reason: "unknown" })
  })

  it("refuses a disabled code", () => {
    expect(decideRedeem("ABCD2345", { ...live, disabled: true }, NOW)).toEqual({
      ok: false, reason: "disabled",
    })
  })

  it("refuses on the millisecond it expires", () => {
    expect(decideRedeem("ABCD2345", { ...live, expiresAt: NOW }, NOW)).toEqual({
      ok: false, reason: "expired",
    })
    expect(decideRedeem("ABCD2345", { ...live, expiresAt: NOW + 1 }, NOW)).toEqual({ ok: true })
  })

  it("treats a null expiry as never expiring", () => {
    expect(decideRedeem("ABCD2345", { ...live, expiresAt: null }, NOW)).toEqual({ ok: true })
  })

  it("allows the use that lands exactly on maxUses, and refuses the next", () => {
    expect(decideRedeem("ABCD2345", { ...live, uses: 4 }, NOW)).toEqual({ ok: true })
    expect(decideRedeem("ABCD2345", { ...live, uses: 5 }, NOW)).toEqual({
      ok: false, reason: "exhausted",
    })
  })

  it("treats a MISSING maxUses as single-use, not unlimited", () => {
    // The safe direction for a field somebody forgot to set on a code they
    // minted by hand. Reading absent as unlimited would quietly uncap the gate.
    expect(decideRedeem("ABCD2345", { uses: 0 }, NOW)).toEqual({ ok: true })
    expect(decideRedeem("ABCD2345", { uses: 1 }, NOW)).toEqual({ ok: false, reason: "exhausted" })
  })

  it("rejects an obviously-not-a-code before touching the database", () => {
    expect(decideRedeem("", live, NOW)).toEqual({ ok: false, reason: "malformed" })
    expect(decideRedeem("!!", live, NOW)).toEqual({ ok: false, reason: "malformed" })
  })
})

describe("messageFor", () => {
  it("does not confirm that an invalid code exists", () => {
    // Distinguishing "expired" from "unknown" turns guessing into a two-step
    // oracle, and the person reading it can do nothing differently either way.
    expect(messageFor("expired")).toBe(messageFor("unknown"))
    expect(messageFor("disabled")).toBe(messageFor("unknown"))
  })

  it("does distinguish the one case that IS actionable", () => {
    // Their friend's code ran out; they should ask for another.
    expect(messageFor("exhausted")).not.toBe(messageFor("unknown"))
    expect(messageFor("exhausted")).toMatch(/fresh|another/i)
  })
})
