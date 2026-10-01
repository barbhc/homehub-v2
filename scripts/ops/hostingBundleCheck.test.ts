import { describe, expect, it } from "vitest"
import { checkHostingBundle, checkHostingEnv, expectedProjectFrom, type BuiltFile } from "./hostingBundleCheck"

const PROJECT = "homehub-2068d"
const KEY = "AIza" + "x".repeat(35)

// The config object exactly as a production `vite build` embeds it (minified).
const prodConfig = `apiKey:"${KEY}",authDomain:"${PROJECT}.firebaseapp.com",projectId:"${PROJECT}",storageBucket:"${PROJECT}.firebasestorage.app"`
// …and the app's fallback exactly as a real no-.env build emits it (HH-162): the
// project id is hoisted into a variable, so it never appears as projectId:"demo-homehub".
const demoConfig = 'apiKey:"demo-api-key",authDomain:`${xu}.firebaseapp.com`,projectId:xu,storageBucket:`${xu}.appspot.com`'
const demoPrelude = 'const xu="demo-homehub";'

const demoBundle = (): BuiltFile[] => [
  { path: "index.html", text: html() },
  { path: "assets/index-AbC123.js", text: `${demoPrelude}const c={${demoConfig}};export{c};` },
]

const html = (entry = "/assets/index-AbC123.js") =>
  `<!doctype html><html><head><script type="module" crossorigin src="${entry}"></script></head><body></body></html>`

const bundle = (config: string, extra: BuiltFile[] = []): BuiltFile[] => [
  { path: "index.html", text: html() },
  { path: "assets/index-AbC123.js", text: `const a=1;const c={${config}};export{c};` },
  { path: "assets/ItemDetailPage-Zz9.js", text: "export const page=1" },
  ...extra,
]

const prodEnv = {
  VITE_FIREBASE_API_KEY: KEY,
  VITE_FIREBASE_AUTH_DOMAIN: `${PROJECT}.firebaseapp.com`,
  VITE_FIREBASE_PROJECT_ID: PROJECT,
}

describe("checkHostingBundle — what will actually be uploaded", () => {
  it("passes a production build that embeds the target project's config", () => {
    expect(checkHostingBundle(bundle(prodConfig), PROJECT)).toEqual({ ok: true, problems: [] })
  })

  it("refuses the build that broke sign-in on 2026-09-30: the built-in test settings", () => {
    const out = checkHostingBundle(demoBundle(), PROJECT)
    expect(out.ok).toBe(false)
    expect(out.problems.join("\n")).toMatch(/built-in test Firebase settings/)
    expect(out.problems.join("\n")).toMatch(/did not pick up the production settings/)
  })

  it("refuses a bundle that carries the demo config anywhere, even beside the real one", () => {
    const out = checkHostingBundle(bundle(prodConfig, [{ path: "assets/chunk-1.js", text: `${demoPrelude}x={${demoConfig}}` }]), PROJECT)
    expect(out.ok).toBe(false)
    expect(out.problems).toEqual([expect.stringMatching(/^assets\/chunk-1\.js carries the built-in test/)])
  })

  it("refuses a bundle naming the test project even without the test key", () => {
    const out = checkHostingBundle(bundle(prodConfig, [{ path: "assets/chunk-2.js", text: 'const p="demo-homehub"' }]), PROJECT)
    expect(out.problems).toEqual([expect.stringMatching(/^assets\/chunk-2\.js carries the built-in test/)])
  })

  it("refuses a build configured for a different project", () => {
    const out = checkHostingBundle(bundle(prodConfig.replaceAll(PROJECT, "someone-else")), PROJECT)
    expect(out.ok).toBe(false)
    expect(out.problems.join("\n")).toMatch(/No script embeds projectId "homehub-2068d"/)
  })

  it("refuses an embedded config without a real web key", () => {
    const out = checkHostingBundle(bundle(prodConfig.replace(KEY, "")), PROJECT)
    expect(out.ok).toBe(false)
    expect(out.problems.join("\n")).toMatch(/has no Firebase web key/)
  })

  it("refuses an empty or half-built dist/", () => {
    expect(checkHostingBundle([], PROJECT).problems).toEqual(
      expect.arrayContaining([expect.stringMatching(/index\.html is missing/), expect.stringMatching(/holds no scripts/)]),
    )
    const missingEntry: BuiltFile[] = [{ path: "index.html", text: html("/assets/index-Gone.js") }, ...bundle(prodConfig).slice(1)]
    expect(checkHostingBundle(missingEntry, PROJECT).problems).toEqual([
      "dist/index.html loads assets/index-Gone.js, which is not in dist/.",
    ])
  })
})

describe("checkHostingEnv — what Vite is about to inline", () => {
  it("passes the production settings", () => {
    expect(checkHostingEnv(prodEnv, PROJECT)).toEqual({ ok: true, problems: [] })
  })

  it("refuses a checkout with no production .env, and says how to fix it", () => {
    const out = checkHostingEnv({}, PROJECT)
    expect(out.ok).toBe(false)
    expect(out.problems[0]).toMatch(/no production \.env.*Copy the production \.env in first/s)
  })

  it("refuses settings for another project, a malformed key, a missing auth domain, or emulator mode", () => {
    expect(checkHostingEnv({ ...prodEnv, VITE_FIREBASE_PROJECT_ID: "demo-homehub" }, PROJECT).problems).toEqual([
      'VITE_FIREBASE_PROJECT_ID is "demo-homehub", but this deploy targets "homehub-2068d".',
    ])
    expect(checkHostingEnv({ ...prodEnv, VITE_FIREBASE_API_KEY: "demo-api-key" }, PROJECT).problems).toEqual([
      "VITE_FIREBASE_API_KEY does not look like a Firebase web key (AIza…).",
    ])
    expect(checkHostingEnv({ ...prodEnv, VITE_FIREBASE_AUTH_DOMAIN: undefined }, PROJECT).problems).toEqual([
      "VITE_FIREBASE_AUTH_DOMAIN is not set.",
    ])
    expect(checkHostingEnv({ ...prodEnv, VITE_USE_EMULATORS: "true" }, PROJECT).ok).toBe(false)
  })
})

describe("expectedProjectFrom — which project the deploy targets", () => {
  const rc = { projects: { default: "homehub-2068d" } }
  it("takes the Firebase CLI's GCLOUD_PROJECT first", () => {
    expect(expectedProjectFrom({ GCLOUD_PROJECT: "other-proj" }, rc)).toBe("other-proj")
  })
  it("falls back to .firebaserc's default", () => {
    expect(expectedProjectFrom({}, rc)).toBe("homehub-2068d")
  })
  it("returns null rather than guessing", () => {
    expect(expectedProjectFrom({}, null)).toBeNull()
    expect(expectedProjectFrom({ GCLOUD_PROJECT: "  " }, { projects: {} })).toBeNull()
  })
})
