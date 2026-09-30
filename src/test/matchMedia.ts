/**
 * `window.matchMedia` for jsdom, which has none.
 *
 * Without it, anything that picks its layout in JS — the item page renders ONE
 * tree for its width (useIsDesktop) — throws on mount or falls back to a
 * guess, so a unit test could not say which tree it meant to render. This
 * answers width queries against a width the test controls, and tells change
 * listeners when a query flips, the way a browser does on resize.
 *
 * Every other feature (`prefers-color-scheme`, `display-mode`, …) answers
 * false: the same answer the code's own "no matchMedia" guards already give.
 */

/** A phone. The product is mobile-first, so a test that does not ask gets the
 *  phone layout; `setTestViewportWidth(1440)` asks for the desktop one. */
export const DEFAULT_TEST_VIEWPORT_WIDTH = 390

let width = DEFAULT_TEST_VIEWPORT_WIDTH

type Registration = {
  query: string
  listener: EventListenerOrEventListenerObject
  /** What this listener was last told, so it hears about flips only. */
  matched: boolean
}
const registrations = new Set<Registration>()

const FEATURE = /\([^)]*\)/g
const WIDTH_FEATURE = /^\(\s*(min|max)-width\s*:\s*([\d.]+)(px|rem|em)\s*\)$/

/** Width features only, AND-ed; anything else in the query makes it false. */
export function evaluateTestMediaQuery(query: string, atWidth: number): boolean {
  const features = query.match(FEATURE) ?? []
  if (features.length === 0) return false
  return features.every((feature) => {
    const m = WIDTH_FEATURE.exec(feature)
    if (!m) return false
    const px = m[3] === "px" ? Number(m[2]) : Number(m[2]) * 16
    return m[1] === "min" ? atWidth >= px : atWidth <= px
  })
}

function notify(reg: Registration, matches: boolean) {
  const event = { matches, media: reg.query } as MediaQueryListEvent
  if (typeof reg.listener === "function") reg.listener(event)
  else reg.listener.handleEvent(event)
}

function createMediaQueryList(query: string): MediaQueryList {
  const mine = new Map<EventListenerOrEventListenerObject, Registration>()
  const add = (type: string, listener: EventListenerOrEventListenerObject | null) => {
    if (type !== "change" || !listener || mine.has(listener)) return
    const reg = { query, listener, matched: evaluateTestMediaQuery(query, width) }
    mine.set(listener, reg)
    registrations.add(reg)
  }
  const remove = (type: string, listener: EventListenerOrEventListenerObject | null) => {
    if (type !== "change" || !listener) return
    const reg = mine.get(listener)
    if (reg) registrations.delete(reg)
    mine.delete(listener)
  }
  const list = {
    media: query,
    get matches() {
      return evaluateTestMediaQuery(query, width)
    },
    onchange: null,
    addEventListener: add,
    removeEventListener: remove,
    // The pre-2020 API some libraries still call.
    addListener: (listener: EventListener | null) => add("change", listener),
    removeListener: (listener: EventListener | null) => remove("change", listener),
    dispatchEvent: () => false,
  }
  // A test double for a DOM interface: it implements the members this app and
  // its libraries call, not the whole EventTarget surface.
  return list as unknown as MediaQueryList
}

/** Resize the test "window": every change listener whose query flips hears
 *  about it, exactly once, as it would on a real resize. */
export function setTestViewportWidth(next: number): void {
  width = next
  for (const reg of [...registrations]) {
    const matches = evaluateTestMediaQuery(reg.query, width)
    if (matches === reg.matched) continue
    reg.matched = matches
    notify(reg, matches)
  }
}

/** How many change listeners are attached right now — lets a test prove a
 *  hook unsubscribes rather than leaking a listener per mount. */
export function activeTestMediaListeners(): number {
  return registrations.size
}

export function installTestMatchMedia(): void {
  if (typeof window === "undefined") return
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: createMediaQueryList,
  })
}

/** Back to a phone between tests, silently: components from the last test are
 *  already unmounted, so there is nobody to tell. */
export function resetTestViewportWidth(): void {
  width = DEFAULT_TEST_VIEWPORT_WIDTH
  for (const reg of registrations) reg.matched = evaluateTestMediaQuery(reg.query, width)
}
