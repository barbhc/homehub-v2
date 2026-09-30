import { describe, it, expect, vi, afterEach } from "vitest"
import { sha256Hex } from "./contentHash"

const ABC = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("sha256Hex — the identity of a file's bytes (HH-154)", () => {
  it("matches the standard SHA-256 test vector", async () => {
    expect(await sha256Hex(new Blob(["abc"]))).toBe(ABC)
  })

  it("is the same for the same bytes whatever the file is called — the name is not the content", async () => {
    const a = new File(["%PDF-1.4 rice cooker"], "Rice Cooker.pdf", { type: "application/pdf" })
    const b = new File(["%PDF-1.4 rice cooker"], "rice-cooker (1).pdf", { type: "application/pdf" })
    expect(await sha256Hex(a)).toBe(await sha256Hex(b))
  })

  it("differs when one byte does", async () => {
    expect(await sha256Hex(new Blob(["%PDF-1.4 a"]))).not.toBe(await sha256Hex(new Blob(["%PDF-1.4 b"])))
  })

  it("hands digest a byte VIEW, never a bare ArrayBuffer — the CI failure on Node 20", async () => {
    // Under vitest's jsdom, Blob.arrayBuffer() returns jsdom's ArrayBuffer, and
    // Node 20's webcrypto checks a bare ArrayBuffer by its prototype, so CI
    // threw "2nd argument is not instance of ArrayBuffer, Buffer, TypedArray,
    // or DataView." Node 22 (local) is lenient, which is how it passed there.
    // This digest refuses anything but a view, so the rule holds on every
    // Node version — not only on the strict one.
    const real = crypto.subtle.digest.bind(crypto.subtle)
    const digest = vi.spyOn(crypto.subtle, "digest").mockImplementation((algorithm, data) =>
      ArrayBuffer.isView(data)
        ? real(algorithm, data)
        : Promise.reject(new TypeError("2nd argument is not instance of ArrayBuffer, Buffer, TypedArray, or DataView.")),
    )
    expect(await sha256Hex(new File(["abc"], "manual.pdf", { type: "application/pdf" }))).toBe(ABC)
    expect(digest).toHaveBeenCalledTimes(1)
  })

  it("without Web Crypto it says so — never an empty or invented hash", async () => {
    // An insecure http origin has no crypto.subtle. The caller decides what a
    // missing hash costs (uploadManualPdf uploads without one and logs it).
    vi.stubGlobal("crypto", {})
    await expect(sha256Hex(new Blob(["abc"]))).rejects.toThrow(/Web Crypto/)
  })
})
