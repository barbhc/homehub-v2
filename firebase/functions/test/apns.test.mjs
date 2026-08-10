// Token-dialect classification — the fault line that made iOS pushes silently
// unreachable. A raw APNs token is exactly 64 hex chars; everything else is FCM.
import test from "node:test"
import assert from "node:assert"
import { isApnsToken } from "../lib/firebase/functions/src/push/apns.js"

test("raw APNs tokens are 64 hex chars", () => {
  assert.equal(isApnsToken("a".repeat(64)), true)
  assert.equal(isApnsToken("0123456789abcdef".repeat(4)), true)
  assert.equal(isApnsToken("0123456789ABCDEF".repeat(4)), true)
})

test("FCM registration tokens are not misclassified", () => {
  assert.equal(isApnsToken("dXyZ123:APA91bE-long-fcm-registration-token-goes-here"), false)
  assert.equal(isApnsToken("a".repeat(63)), false)
  assert.equal(isApnsToken("a".repeat(65)), false)
  assert.equal(isApnsToken("g".repeat(64)), false)  // not hex
  assert.equal(isApnsToken(""), false)
})
