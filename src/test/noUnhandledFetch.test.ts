/**
 * A failed fetch must never leave a spinner on screen.
 *
 * The item page hung on "Loading..." forever because a six-way Promise.all had
 * no .catch(): a rejection skipped the .then, so setLoading(false) never ran.
 * On a phone one dropped request is enough, and an endless spinner is
 * indistinguishable from the app being slow — which is exactly how it was
 * reported, three times, before anyone found the cause.
 *
 * Eight files shared the pattern. This is a source-level guard so the ninth
 * doesn't ship: any component that starts a fetch chain must also handle its
 * rejection, whether by .catch, .finally, or try/catch.
 */
import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) out.push(p)
  }
  return out
}

describe("fetch chains handle their own rejections", () => {
  it("no file starts a Promise.all chain without handling failure", () => {
    const offenders: string[] = []
    for (const file of walk("src")) {
      const src = readFileSync(file, "utf8")
      if (!src.includes("Promise.all(")) continue
      // Only components that OWN a spinner can strand the user. Services and SWR
      // fetchers propagate on purpose — the caller decides what a failure means,
      // and bolting a .catch() onto them would swallow errors that callers need.
      if (!src.includes("setLoading(")) continue
      // Any of these three is a legitimate way to handle it. `soft()` wraps each
      // promise in its own catch, which is the useDashboard pattern.
      const handled =
        src.includes(".catch(") || src.includes(".finally(") || /}\s*catch\s*\(/.test(src) || src.includes("soft(")
      if (!handled) offenders.push(file)
    }
    expect(offenders, `Promise.all with no rejection handling:\n  ${offenders.join("\n  ")}`).toEqual([])
  })
})
