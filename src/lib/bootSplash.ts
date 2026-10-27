/**
 * Boot splash control. The splash lives in index.html so it paints with the
 * first frame, before the JS bundle parses. It is only the page colour (light
 * or dark, as the pre-paint theme script chose) — the same surface the iOS
 * shell's launch screen and WebView paint natively — so the cold start reads as
 * one screen. Here we just fade it out once React knows what to show.
 */
let hidden = false

/**
 * Fade out and remove the index.html boot splash. Idempotent — safe to call
 * from multiple "ready" signals. A safety timeout in index.html removes the
 * splash independently if this is never reached.
 */
export function hideBootSplash(): void {
  if (hidden) return
  hidden = true
  const el = document.getElementById("boot-splash")
  if (!el) return
  el.classList.add("boot-splash--hide")
  // Remove after the CSS fade (0.2s, none under Reduce Motion) so a stale
  // layer can't swallow taps.
  window.setTimeout(() => el.remove(), 500)
}
