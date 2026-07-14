/**
 * v2 Firebase TARGET (Admin SDK). Credentials come from
 * GOOGLE_APPLICATION_CREDENTIALS (a service-account JSON) — firebase-admin reads
 * it automatically. A hard guard refuses to run against the "demo-homehub"
 * emulator project id, so an import can never overwrite emulator fixtures.
 */
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
import { getAuth } from "firebase-admin/auth"
import { getStorage } from "firebase-admin/storage"
import { requireEnv } from "./env.js"

let ready = false
function init(): void {
  if (ready) return
  const projectId = requireEnv("FIREBASE_PROJECT_ID")
  if (projectId === "demo-homehub" || process.env.FIRESTORE_EMULATOR_HOST) {
    console.error("\n✖ Target looks like the EMULATOR (demo-homehub / FIRESTORE_EMULATOR_HOST set).\n  The import writes to PRODUCTION only. Unset emulator env + point at the real project.")
    process.exit(1)
  }
  if (getApps().length === 0) {
    initializeApp({
      credential: applicationDefault(),
      projectId,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    })
  }
  getFirestore().settings({ ignoreUndefinedProperties: true })
  ready = true
}

export function db() {
  init()
  return getFirestore()
}
export function auth() {
  init()
  return getAuth()
}
export function bucket() {
  init()
  return getStorage().bucket()
}
