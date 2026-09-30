import { test, devices } from "@playwright/test"

/**
 * Cold-start timing (TTFB / FCP / load, font requests, origins) of a DEPLOYED
 * site under a throttled phone profile. A manual measurement, never a gate.
 *
 * The target has NO default. It used to fall back to the production site, so
 * `npx playwright test --project=smoke` without a file filter — this project
 * matches every e2e/smoke spec — loaded production on every local run
 * (non-negotiable 7). Now the test skips unless the URL is named on purpose:
 *
 *   PW_COLDSTART_URL=https://homehub-2068d.web.app/ \
 *     npx playwright test e2e/smoke/coldstart.spec.ts --project=smoke
 *
 * CI never sets it, and ci.yml runs e2e/smoke/boot.spec.ts alone anyway.
 */
test.use({ ...devices["Pixel 5"], storageState: { cookies: [], origins: [] } })

test("cold start of a deployed site", async ({ page, context }) => {
  const url = process.env.PW_COLDSTART_URL
  test.skip(!url, "Set PW_COLDSTART_URL to the deployed site to measure. There is no default on purpose — it used to be production.")
  if (!url) return // test.skip() above already ended the test; this only narrows the type

  const client = await context.newCDPSession(page)
  await client.send("Emulation.setCPUThrottlingRate", { rate: 4 })
  await client.send("Network.enable")
  await client.send("Network.emulateNetworkConditions", {
    offline: false, downloadThroughput: (12 * 1024 * 1024) / 8,
    uploadThroughput: (3 * 1024 * 1024) / 8, latency: 120,
  })
  const t0 = Date.now()
  await page.goto(url, { waitUntil: "load" })
  const wall = Date.now() - t0
  await page.waitForTimeout(6000)
  const m = await page.evaluate(() => {
    const n = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming
    const res = performance.getEntriesByType("resource") as PerformanceResourceTiming[]
    const fonts = res.filter((r) => /fonts\.(googleapis|gstatic)/.test(r.name))
    return {
      ttfb: Math.round(n.responseStart),
      fcp: Math.round(performance.getEntriesByType("paint").find((p) => p.name === "first-contentful-paint")?.startTime ?? -1),
      load: Math.round(n.loadEventEnd),
      fontReqs: fonts.length,
      fontMs: Math.round(fonts.reduce((s, r) => s + r.duration, 0)),
      origins: [...new Set(res.map((r) => new URL(r.name).origin))],
    }
  })
  console.log(`WALL=${wall} TTFB=${m.ttfb} FCP=${m.fcp} LOAD=${m.load}`)
  console.log(`FONT REQUESTS=${m.fontReqs} totalMs=${m.fontMs}`)
  console.log("ORIGINS:", m.origins.join(" "))
})
