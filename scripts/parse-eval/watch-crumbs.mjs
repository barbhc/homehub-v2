import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
const HERE = dirname(fileURLToPath(import.meta.url))
const env=Object.fromEntries(readFileSync(join(HERE,"..","..",".env"),"utf8").split("\n").filter(l=>l.includes("=")).map(l=>{const i=l.indexOf("=");return[l.slice(0,i).trim(),l.slice(i+1).trim()]}))
const sb=createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
let last = ""
const deadline = Date.now() + 15 * 60 * 1000
for (;;) {
  const { data } = await sb.from("manual_document").select("manual_id, parsed_at, updated_at, parse_draft").eq("item_unit_id","b6eebc35-7558-4c34-af42-97d6e13cdfea")
  for (const m of data ?? []) {
    const d = m.parse_draft
    const state = d?._error ? `FAILED: ${String(d.detail??"").slice(0,200)}`
      : d?._progress ? `stage: ${d._progress} ${JSON.stringify({...d, _progress:undefined, at:undefined})}`
      : d ? "DRAFT stored"
      : (m.parsed_at && m.parsed_at > "2026-06-30") ? `COMMITTED ${m.parsed_at}` : null
    if (state && state !== last) {
      console.log(`[${new Date().toISOString().slice(11,19)}] ${m.manual_id.slice(0,8)}: ${state}`)
      last = state
      if (state.startsWith("COMMITTED") || state.startsWith("FAILED") || state.startsWith("DRAFT")) process.exit(0)
    }
  }
  if (Date.now() > deadline) { console.log("TIMEOUT 15min — no breadcrumb at all: background never started"); process.exit(1) }
  await new Promise(r => setTimeout(r, 5000))
}
