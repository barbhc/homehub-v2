/**
 * The identity of a file's CONTENT: SHA-256 of its bytes, lowercase hex.
 *
 * HH-154 (owner, 2026-09-05): "Why is the rice cooker saved 4 times here?"
 * Every upload lands at a fresh storage path (`manual_<timestamp>.pdf`), so a
 * path can never say "this is the file you already gave us" — only the bytes
 * can. Computed in the browser, before the upload, with Web Crypto.
 *
 * Throws where Web Crypto is unavailable (an insecure http origin, an old
 * runtime) rather than return an empty or made-up hash; callers decide what a
 * missing hash costs them (uploadManualPdf logs and uploads without one).
 */
export async function sha256Hex(blob: Blob): Promise<string> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) throw new Error("Web Crypto (crypto.subtle) is not available here, so the file cannot be hashed")
  // A byte VIEW, never the bare ArrayBuffer. The buffer can come from another
  // realm — under vitest's jsdom, `Blob.arrayBuffer()` returns jsdom's
  // ArrayBuffer — and Node 20's webcrypto checks a bare ArrayBuffer by its
  // prototype, rejecting that one ("2nd argument is not instance of
  // ArrayBuffer…"); CI failed exactly so. Every implementation accepts a view.
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const digest = await subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")
}
