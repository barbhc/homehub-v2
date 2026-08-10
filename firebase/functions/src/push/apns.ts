/**
 * Direct-to-APNs send lane for iOS device tokens.
 *
 * The Capacitor push plugin hands the webview Apple's RAW APNs token — no
 * Firebase iOS SDK involved — and FCM multicast can only address FCM
 * registration tokens. v1's edge function branched per platform; the v2 port
 * kept only the FCM lane, which made every iOS token silently unreachable
 * while web sends reported success. This restores the iOS lane, per the
 * architecture the shipping-web-apps-to-ios scar index validates: send
 * straight to Apple over HTTP/2 with an ES256 JWT, no new dependencies.
 *
 * Doctrine (learned the expensive way, twice, by that index): surface APNs's
 * `reason` string and the topic actually sent in every failure — status codes
 * alone cannot distinguish a dead token from a wrong key environment.
 */
import { createPrivateKey, createSign } from "node:crypto"
import { connect } from "node:http2"

/** Raw APNs device tokens are 64 hex chars; FCM registration tokens are not. */
export function isApnsToken(token: string): boolean {
  return /^[0-9a-f]{64}$/i.test(token)
}

const TOPIC = "com.bc.homehub"
const HOST = "https://api.push.apple.com"

let cachedJwt: { value: string; iat: number } | null = null

/** APNs provider JWTs must be reused (Apple throttles minting) but die at 60m;
 *  refresh at 45. */
function providerJwt(keyId: string, teamId: string, p8: string): string {
  const now = Math.floor(Date.now() / 1000)
  if (cachedJwt && now - cachedJwt.iat < 45 * 60) return cachedJwt.value
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url")
  const head = b64({ alg: "ES256", kid: keyId })
  const body = b64({ iss: teamId, iat: now })
  const signer = createSign("SHA256")
  signer.update(`${head}.${body}`)
  const sig = signer
    .sign({ key: createPrivateKey(p8), dsaEncoding: "ieee-p1363" })
    .toString("base64url")
  cachedJwt = { value: `${head}.${body}.${sig}`, iat: now }
  return cachedJwt.value
}

export interface ApnsResult {
  token: string
  status: number
  /** Apple's reason string on failure — the diagnostic that matters. */
  reason: string | null
  /** True only for definitive "this token is dead" answers (410, or an
   *  explicit BadDeviceToken). Transient failures must never prune. */
  definitivelyDead: boolean
}

/** Send one alert to one raw APNs token. One HTTP/2 session per invocation
 *  batch would be nicer; per-send sessions keep the error paths simple, and a
 *  home's iOS fleet is single digits. Error paths destroy() — a graceful
 *  close waits on the very stream that stalled. */
export function sendApns(
  token: string,
  payload: { title: string; body: string; url?: string },
  creds: { keyId: string; teamId: string; p8: string },
): Promise<ApnsResult> {
  return new Promise((resolve) => {
    const session = connect(HOST)
    const done = (status: number, reason: string | null) => {
      session.destroy()
      resolve({
        token,
        status,
        reason,
        definitivelyDead: status === 410 || reason === "BadDeviceToken",
      })
    }
    session.on("error", (e) => done(0, `session: ${e.message}`))

    const req = session.request({
      ":method": "POST",
      ":path": `/3/device/${token}`,
      authorization: `bearer ${providerJwt(creds.keyId, creds.teamId, creds.p8)}`,
      "apns-topic": TOPIC,
      "apns-push-type": "alert",
      "apns-priority": "10",
    })
    let status = 0
    let bodyText = ""
    req.on("response", (h) => { status = Number(h[":status"] ?? 0) })
    req.on("data", (c: Buffer) => { bodyText += c.toString() })
    req.on("end", () => {
      let reason: string | null = null
      if (status !== 200) {
        try { reason = (JSON.parse(bodyText) as { reason?: string }).reason ?? bodyText.slice(0, 80) }
        catch { reason = bodyText.slice(0, 80) || null }
        console.warn(`[apns] status=${status} reason=${reason} topic=${TOPIC}`)
      }
      done(status, reason)
    })
    req.on("error", (e) => done(0, `stream: ${e.message}`))
    req.end(JSON.stringify({
      aps: { alert: { title: payload.title, body: payload.body }, sound: "default" },
      ...(payload.url ? { url: payload.url } : {}),
    }))
  })
}
