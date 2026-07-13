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
    const token = await auth.currentUser?.getIdToken().catch(() => undefined)
    if (!token) return { url: pdfUrl }
    return {
      url: `${functionUrl("proxyPdf")}?url=${encodeURIComponent(pdfUrl)}`,
      httpHeaders: { Authorization: `Bearer ${token}` },
    }
  } catch {
    return { url: pdfUrl }
  }
}
