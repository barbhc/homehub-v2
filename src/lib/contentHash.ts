/**
 * The identity of a file's CONTENT: SHA-256 of its bytes, lowercase hex.
 *
 * HH-154 (owner, 2026-09-05): "Why is the rice cooker saved 4 times here?"
 * Every upload lands at a fresh storage path (`manual_<timestamp>.pdf`), so a
 * path can never say "this is the file you already gave us" — only the bytes
 * can. Computed in the browser, before the upload, with Web Crypto.
 *
 * Throws where Web Crypto is unavailable (an insecure http origin); callers
 * decide what a missing hash costs them.
 */
export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")
}
