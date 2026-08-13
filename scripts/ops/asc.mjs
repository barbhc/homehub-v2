/**
 * App Store Connect API client — ES256-signed JWT, no dependencies.
 *
 * Credentials come from the environment, never the repo:
 *   ASC_KEY_ID     the API key id (the .p8 lives in ~/.appstoreconnect/private_keys)
 *   ASC_ISSUER_ID  the issuer UUID from Users and Access → Integrations
 *   ASC_APP_ID     the app's numeric id
 *
 * `dsaEncoding: "ieee-p1363"` is load-bearing: Node's default DER encoding
 * produces a signature Apple rejects with an opaque 401.
 */
import { createPrivateKey, createSign } from "node:crypto"
import { readFileSync } from "node:fs"
import { homedir } from "node:os"

const KEY_ID = process.env.ASC_KEY_ID
const ISSUER = process.env.ASC_ISSUER_ID
export const APP_ID = process.env.ASC_APP_ID

if (!KEY_ID || !ISSUER) {
  console.error("Set ASC_KEY_ID and ASC_ISSUER_ID (and ASC_APP_ID) first.")
  process.exit(1)
}
const key = createPrivateKey(readFileSync(`${homedir()}/.appstoreconnect/private_keys/AuthKey_${KEY_ID}.p8`))

function jwt() {
  const now = Math.floor(Date.now() / 1000)
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url")
  const head = b64({ alg: "ES256", kid: KEY_ID, typ: "JWT" })
  // Apple rejects provider tokens with a lifetime over 20 minutes.
  const body = b64({ iss: ISSUER, iat: now, exp: now + 900, aud: "appstoreconnect-v1" })
  const s = createSign("SHA256")
  s.update(`${head}.${body}`)
  return `${head}.${body}.${s.sign({ key, dsaEncoding: "ieee-p1363" }).toString("base64url")}`
}

export async function api(path, init = {}) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${jwt()}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  })
  if (!res.ok) {
    const t = await res.text()
    let detail = t.slice(0, 300)
    try { detail = JSON.parse(t).errors?.map((e) => e.detail).join("; ") } catch { /* raw */ }
    throw new Error(`${res.status} ${path}\n  ${detail}`)
  }
  return res.status === 204 ? {} : res.json()
}
