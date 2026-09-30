import { describe, it, expect } from "vitest"
import { sha256Hex } from "./contentHash"

describe("sha256Hex — the identity of a file's bytes (HH-154)", () => {
  it("matches the standard SHA-256 test vector", async () => {
    expect(await sha256Hex(new Blob(["abc"]))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
  })

  it("is the same for the same bytes whatever the file is called — the name is not the content", async () => {
    const a = new File(["%PDF-1.4 rice cooker"], "Rice Cooker.pdf", { type: "application/pdf" })
    const b = new File(["%PDF-1.4 rice cooker"], "rice-cooker (1).pdf", { type: "application/pdf" })
    expect(await sha256Hex(a)).toBe(await sha256Hex(b))
  })

  it("differs when one byte does", async () => {
    expect(await sha256Hex(new Blob(["%PDF-1.4 a"]))).not.toBe(await sha256Hex(new Blob(["%PDF-1.4 b"])))
  })
})
