/**
 * iOS WebKit only applies `:active` while a touch is down if some touchstart
 * listener exists — without one, the press styles in index.css (.hh-press,
 * .hh-press-row) never show on an iPhone, however they look in a desktop
 * browser. One passive, empty listener on the document is the whole fix; it
 * never blocks scrolling.
 */
let installed = false

export function installPressFeedback(doc: Document = document): void {
  if (installed) return
  installed = true
  // Deliberately empty: its existence is what turns :active on.
  doc.addEventListener("touchstart", () => {}, { passive: true })
}
