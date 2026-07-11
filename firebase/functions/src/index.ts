/**
 * Homehub v2 Cloud Functions (2nd gen, Node 20).
 *
 * Phase 1: health check only — proves deploy + callable round-trip.
 * Phase 3 adds the parse worker (enqueueParse callable + onTaskDispatched
 * worker, timeoutSeconds 1800) per docs/homehub-v2-implementation-plan.md.
 */
import { onCall } from "firebase-functions/v2/https"
import { initializeApp } from "firebase-admin/app"

initializeApp()

export const healthCheck = onCall({ region: "us-central1" }, () => {
  return { ok: true, service: "homehub-v2-functions", at: new Date().toISOString() }
})
