import { test, devices } from "@playwright/test"
test.use({ ...devices["Pixel 5"], storageState: { cookies: [], origins: [] } })

test("cold start against prod", async ({ page, context }) => {
  const client = await context.newCDPSession(page)
  await client.send("Emulation.setCPUThrottlingRate", { rate: 4 })
  await client.send("Network.enable")
  await client.send("Network.emulateNetworkConditions", {
    offline: false, downloadThroughput: (12 * 1024 * 1024) / 8,
    uploadThroughput: (3 * 1024 * 1024) / 8, latency: 120,
  })
  const t0 = Date.now()
  await page.goto(process.env.PERF_URL ?? "https://homehub-2068d.web.app/", { waitUntil: "load" })
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
