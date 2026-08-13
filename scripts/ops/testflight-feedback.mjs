/**
 * Pull TestFlight beta feedback — screenshots and crashes — with their images.
 *
 * Testers submit by screenshotting inside TestFlight and annotating. That lands
 * in App Store Connect's web UI, where the comment, build, device and image all
 * get separated the moment anyone relays it by hand. This prints them together
 * and downloads the images so they can actually be looked at.
 *
 * Apple's screenshot URLs are pre-signed and short-lived — fetch them now, not
 * later. Anything already downloaded is skipped on re-runs.
 *
 *   ASC_KEY_ID=… ASC_ISSUER_ID=… ASC_APP_ID=… node scripts/ops/testflight-feedback.mjs
 *   … --since 2026-08-10      only feedback on or after a date
 *   … --out ./feedback        where images land (default: ./testflight-feedback)
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs"
import { api, APP_ID } from "./asc.mjs"

const args = process.argv.slice(2)
const arg = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d }
const SINCE = arg("--since", null)
const OUT = arg("--out", "./testflight-feedback")

const after = (iso) => !SINCE || (iso ?? "").slice(0, 10) >= SINCE
const line = (s = "─") => console.log(s.repeat(72))

async function screenshots() {
  const r = await api(`/v1/apps/${APP_ID}/betaFeedbackScreenshotSubmissions?limit=50&sort=-createdDate`)
  const rows = r.data.filter((f) => after(f.attributes.createdDate))
  console.log(`\nSCREENSHOT FEEDBACK — ${rows.length}${SINCE ? ` since ${SINCE}` : ""}`)
  if (!rows.length) return 0
  mkdirSync(OUT, { recursive: true })
  let n = 0
  for (const f of rows) {
    const a = f.attributes
    line()
    console.log(`${a.createdDate}   ${a.deviceModel ?? "?"} · iOS ${a.osVersion ?? "?"} · build ${a.appPlatform ?? ""}${a.buildBundleId ? " " + a.buildBundleId : ""}`)
    console.log(`  “${a.comment?.trim() || "(no comment — screenshot only)"}”`)
    if (a.batteryPercentage != null) console.log(`  battery ${a.batteryPercentage}%  ·  ${a.connectionType ?? ""}  ·  ${a.screenWidth ?? "?"}x${a.screenHeight ?? "?"}`)
    for (const img of a.screenshots ?? []) {
      if (!img.url) continue
      const path = `${OUT}/${a.createdDate.slice(0, 19).replace(/[:T]/g, "-")}-${++n}.png`
      if (existsSync(path)) { console.log(`  ↩ ${path} (already saved)`); continue }
      const res = await fetch(img.url)
      if (!res.ok) { console.log("  ⚠ image expired — re-run sooner next time"); continue }
      writeFileSync(path, Buffer.from(await res.arrayBuffer()))
      console.log(`  ↓ ${path}`)
    }
  }
  return rows.length
}

async function crashes() {
  const r = await api(`/v1/apps/${APP_ID}/betaFeedbackCrashSubmissions?limit=50&sort=-createdDate`)
    .catch(() => ({ data: [] }))
  const rows = r.data.filter((f) => after(f.attributes.createdDate))
  console.log(`\nCRASH FEEDBACK — ${rows.length}`)
  for (const c of rows) {
    const a = c.attributes
    line()
    console.log(`${a.createdDate}   ${a.deviceModel ?? "?"} · iOS ${a.osVersion ?? "?"}`)
    console.log(`  “${a.comment?.trim() || "(no comment)"}”`)
    if (a.crashLog) console.log(`  crash log available via the API`)
  }
  return rows.length
}

const s = await screenshots()
const c = await crashes()
line("═")
console.log(`${s} screenshot · ${c} crash${SINCE ? `  (since ${SINCE})` : ""}`)
if (s + c === 0) console.log("Nothing yet. Testers submit via TestFlight → screenshot → Share Beta Feedback.")
