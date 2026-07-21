/**
 * Boot splash control. The splash markup lives in index.html so it paints
 * instantly (before the JS bundle parses or web fonts load) — masking the iOS
 * WebView cold start. Here we just fade it out once React knows what to show.
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
  // Remove after the CSS fade so a stale layer can't swallow taps.
  window.setTimeout(() => el.remove(), 500)
}
