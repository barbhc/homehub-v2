/**
 * Appearance defaults to System for anyone who never chose (2026-10-15), and an
 * explicit choice still wins. Both halves are asserted twice: in the React-side
 * reader (getStoredAppearance) and in the pre-paint snippet index.html actually
 * runs — they are two copies of one rule, and the snippet is the one that
 * decides the first frame.
 */
import indexHtml from "../../index.html?raw"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { APPEARANCE_KEY, DEFAULT_APPEARANCE, THEME_INIT_SNIPPET, getStoredAppearance } from "./theme"

const html = indexHtml

/** Run the pre-paint snippet with the OS reporting dark (or not). */
function runSnippet(osDark: boolean) {
  const original = window.matchMedia
  window.matchMedia = ((query: string) => ({
    matches: osDark && query === "(prefers-color-scheme: dark)",
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
  try {
    new Function(THEME_INIT_SNIPPET)()
  } finally {
    window.matchMedia = original
  }
  return document.documentElement.classList.contains("dark")
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove("dark")
})
afterEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove("dark")
})

describe("appearance default", () => {
  it("is System when nothing was ever chosen", () => {
    expect(DEFAULT_APPEARANCE).toBe("system")
    expect(getStoredAppearance()).toBe("system")
  })

  it("treats an unrecognised stored value as never chosen", () => {
    localStorage.setItem(APPEARANCE_KEY, "sepia")
    expect(getStoredAppearance()).toBe("system")
  })

  it("keeps an explicit choice", () => {
    for (const choice of ["light", "dark", "system"] as const) {
      localStorage.setItem(APPEARANCE_KEY, choice)
      expect(getStoredAppearance()).toBe(choice)
    }
  })
})

describe("pre-paint snippet (index.html)", () => {
  it("is the exact text index.html runs", () => {
    // If these drift, the first frame follows one rule and React the other —
    // a flash of the wrong theme on every cold start.
    expect(html).toContain(THEME_INIT_SNIPPET)
  })

  it("follows a dark OS when nothing was chosen", () => {
    expect(runSnippet(true)).toBe(true)
  })

  it("follows a light OS when nothing was chosen", () => {
    expect(runSnippet(false)).toBe(false)
  })

  it("keeps an explicit Light on a dark OS", () => {
    localStorage.setItem(APPEARANCE_KEY, "light")
    expect(runSnippet(true)).toBe(false)
  })

  it("keeps an explicit Dark on a light OS", () => {
    localStorage.setItem(APPEARANCE_KEY, "dark")
    expect(runSnippet(false)).toBe(true)
  })
})
