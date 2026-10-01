import { auth } from "./auth"
import { functionUrl } from "./functions"

/**
 * Build a pdfjs `getDocument` source for a PDF URL. Cross-origin PDFs (e.g. an
 * Amazon CDN) are routed through the SSRF-guarded `proxyPdf` Cloud Function to
 * dodge browser CORS; the function requires a Firebase ID token, passed via
 * pdfjs `httpHeaders`. Same-origin URLs pass through untouched.
 *
 * Replaces the v1 `getCorsProxiedUrl` string helper (which pointed at the
 * Supabase `proxy-pdf` edge function and returned a bare URL).
 */
export async function pdfProxySource(
  pdfUrl: string,
): Promise<{ url: string; httpHeaders?: Record<string, string> }> {
  try {
    const parsed = new URL(pdfUrl)
    if (parsed.origin === window.location.origin) return { url: pdfUrl }
    // No token: load the PDF directly — if CORS refuses it, that is the viewer's own visible load error.
    const token = await auth.currentUser?.getIdToken().catch(() => undefined)
    if (!token) return { url: pdfUrl }
    return {
      url: `${functionUrl("proxyPdf")}?url=${encodeURIComponent(pdfUrl)}`,
      httpHeaders: { Authorization: `Bearer ${token}` },
    }
  } catch {
    // An unparseable URL goes to pdfjs as-is, which reports its own load error.
    return { url: pdfUrl }
  }
}
