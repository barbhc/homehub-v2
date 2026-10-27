import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { DURATION, EASE } from "../lib/motion"

// The CSS motion tokens (src/index.css) and their JS twins must not drift.
const css = readFileSync(resolve(__dirname, "../index.css"), "utf8")
const cssVar = (name: string) => {
  const m = new RegExp(`--${name}:\\s*([^;]+);`).exec(css)
  if (!m) throw new Error(`--${name} not found in index.css`)
  return m[1].trim()
}

describe("motion tokens", () => {
  it.each(Object.entries(DURATION))("--dur-%s matches DURATION", (key, seconds) => {
    expect(cssVar(`dur-${key}`)).toBe(`${Math.round(seconds * 1000)}ms`)
  })

  it.each(Object.entries(EASE))("--ease-%s matches EASE", (key, points) => {
    expect(cssVar(`ease-${key}`)).toBe(`cubic-bezier(${points.join(", ")})`)
  })
})
