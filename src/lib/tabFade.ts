/**
 * Which of the five tabs a path belongs to, and when a change of tab fades the
 * page in (AppLayout). Pure, so the rule is pinned by src/lib/tabFade.test.ts.
 */
export type Tab = "home" | "tasks" | "items" | "ask" | "settings"

/** The tab whose content this path is — null for pushed pages (a task, a guide, Clean). */
export function tabOf(pathname: string): Tab | null {
  if (pathname === "/home") return "home"
  if (pathname === "/maintenance") return "tasks"
  // The Items tab owns the list, the add flow and an item's own page (AppLayout's inItems).
  if (pathname === "/inventory" || pathname.startsWith("/inventory/") || pathname.startsWith("/items/")) return "items"
  if (pathname === "/chat") return "ask"
  if (pathname === "/settings") return "settings"
  return null
}

/**
 * Fade when the content moves to a different tab by a forward navigation (a
 * tab tap, or a link across tabs). Never on the first render — a deep link or
 * a cold start opens the page as it is — and never on Back/Forward (POP),
 * which restores the page the user left rather than switching to a new one.
 */
export function shouldFadeTab(prev: Tab | null, next: Tab | null, navigationType: "POP" | "PUSH" | "REPLACE"): boolean {
  return next !== null && next !== prev && navigationType !== "POP"
}
