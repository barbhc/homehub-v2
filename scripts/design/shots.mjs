/**
 * npm run shots — capture every /__preview scenario at three device widths and
 * build one commentable gallery.
 *
 * Runs against a dev server (real components, emulator-backed providers), so
 * what the gallery shows is what ships — the whole point, after a week of
 * mockups that "fit" at widths no phone has.
 *
 * Usage:
 *   npm run shots                 # expects a dev server on PW_WEB_PORT || 5283
 *   npm run shots -- --only item  # substring-filter scenario ids
 */
import { chromium } from "@playwright/test"
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs"
import { join } from "node:path"

const PORT = process.env.PW_WEB_PORT || "5283"
const BASE = `http://localhost:${PORT}`
const OUT = "design-shots"
const WIDTHS = [375, 390, 430]
const only = (() => {
  const i = process.argv.indexOf("--only")
  return i === -1 ? null : process.argv[i + 1]
})()

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()

// Auth state if the e2e setup has produced one — provider-backed scenarios need it.
const authFile = "e2e/.auth/user.json"
const ctxOpts = existsSync(authFile) ? { storageState: authFile } : {}

const probe = await browser.newPage()
try {
  await probe.goto(`${BASE}/__preview`, { timeout: 8000 })
} catch {
  console.error(`No dev server on ${BASE}. Start one (npm run dev:emu) or set PW_WEB_PORT.`)
  process.exit(1)
}
await probe.waitForSelector("a[href*='__preview?s=']", { timeout: 10000 })
const scenarios = await probe.evaluate(() =>
  [...document.querySelectorAll("a[href*='__preview?s=']")].map((a) => ({
    id: new URL(a.href).searchParams.get("s"),
    note: a.parentElement?.querySelector("p")?.textContent ?? "",
  })),
)
await probe.close()

const shots = []
for (const sc of scenarios) {
  if (only && !sc.id.includes(only)) continue
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2, ...ctxOpts })
    const page = await ctx.newPage()
    await page.goto(`${BASE}/__preview?s=${sc.id}`)
    await page.waitForSelector(`[data-preview-scenario="${sc.id}"]`, { timeout: 10000 })
    await page.waitForTimeout(400) // fonts/images settle
    const file = `${sc.id}--${width}.png`
    await page.locator(`[data-preview-scenario="${sc.id}"]`).screenshot({ path: join(OUT, file) })
    shots.push({ id: sc.id, note: sc.note, width, file })
    await ctx.close()
    console.log(`✓ ${file}`)
  }
}
await browser.close()

// One self-contained gallery page: scenarios × widths, images inlined.
const byId = new Map()
for (const s of shots) {
  if (!byId.has(s.id)) byId.set(s.id, { note: s.note, widths: [] })
  byId.get(s.id).widths.push(s)
}
const section = ([id, g]) => `
  <section>
    <h2>${id}</h2>
    <p class="note">${g.note}</p>
    <div class="row">${g.widths
      .map((s) => {
        const b64 = readFileSync(join(OUT, s.file)).toString("base64")
        return `<figure><figcaption>${s.width}pt</figcaption><img alt="${id} at ${s.width}" src="data:image/png;base64,${b64}"></figure>`
      })
      .join("")}</div>
  </section>`

writeFileSync(
  join(OUT, "gallery.html"),
  `<title>Homehub Design Shots</title>
<style>
  :root{ --ink:#1E241C; --sub:#6B7166; --line:#E3E5E0; --bg:#F5F3EE; }
  @media (prefers-color-scheme: dark){ :root:not([data-theme="light"]){ --ink:#F0EEE2; --sub:#A8AE9A; --line:#343A2C; --bg:#15180F; } }
  :root[data-theme="dark"]{ --ink:#F0EEE2; --sub:#A8AE9A; --line:#343A2C; --bg:#15180F; }
  body{ margin:0; background:var(--bg); color:var(--ink); font:15px/1.5 -apple-system,system-ui,sans-serif; padding:32px 24px 80px; }
  h1{ margin:0 0 4px; } .sub{ color:var(--sub); margin:0 0 28px; }
  section{ border-top:1px solid var(--line); padding:20px 0; }
  h2{ font-size:15px; font-family:ui-monospace,monospace; margin:0 0 2px; }
  .note{ color:var(--sub); font-size:13.5px; margin:0 0 14px; max-width:70ch; }
  .row{ display:flex; gap:18px; overflow-x:auto; padding-bottom:6px; }
  figure{ margin:0; flex:0 0 auto; }
  figcaption{ font-size:11.5px; color:var(--sub); margin-bottom:4px; }
  img{ display:block; width:280px; height:auto; border:1px solid var(--line); border-radius:14px; }
</style>
<h1>Design shots</h1>
<p class="sub">Real components at real widths — captured ${new Date().toISOString().slice(0, 16).replace("T", " ")} · comment on anything that looks wrong.</p>
${[...byId.entries()].map(section).join("\n")}`,
)
console.log(`\ngallery: ${OUT}/gallery.html (${byId.size} scenarios × ${WIDTHS.length} widths)`)
