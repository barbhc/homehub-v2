import { initializeApp, type FirebaseApp } from "firebase/app"

/**
 * Firebase app init. Config comes from VITE_ env (client-safe by design — none
 * of these values are secrets; security lives in Firestore rules + Auth).
 *
 * Emulator mode: with VITE_USE_EMULATORS=true (npm run dev:emu) the app uses the
 * "demo-homehub" project id, which the Emulator Suite accepts with NO real
 * Firebase project — auth/firestore/storage/functions all run locally. Each
 * integration module calls its own connect*Emulator guarded by USE_EMULATORS.
 */
export const USE_EMULATORS = import.meta.env.VITE_USE_EMULATORS === "true"

export const DEMO_PROJECT_ID = "demo-homehub"

const DEMO_CONFIG = {
  apiKey: "demo-api-key",
  authDomain: `${DEMO_PROJECT_ID}.firebaseapp.com`,
  projectId: DEMO_PROJECT_ID,
  storageBucket: `${DEMO_PROJECT_ID}.appspot.com`,
  messagingSenderId: "0",
  appId: "demo-app-id",
}

// Emulator mode pins the demo config WHOLESALE. A developer .env holding real
// VITE_FIREBASE_* values (kept around for prod deploys) must never leak into
// emulator runs: the Emulator Suite namespaces data by projectId, so a real
// projectId reads an empty namespace and every seeded fixture silently
// "disappears" (auth succeeds, memberships come back empty, e2e dies in setup).
const firebaseConfig = USE_EMULATORS
  ? DEMO_CONFIG
  : {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? DEMO_CONFIG.apiKey,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? DEMO_CONFIG.authDomain,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? DEMO_CONFIG.projectId,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? DEMO_CONFIG.storageBucket,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? DEMO_CONFIG.messagingSenderId,
      appId: import.meta.env.VITE_FIREBASE_APP_ID ?? DEMO_CONFIG.appId,
    }

export const firebaseApp: FirebaseApp = initializeApp(firebaseConfig)

/**
 * Emulator ports, overridable per-suite.
 *
 * Hardcoded ports mean exactly one emulator stack can exist on a machine, so a
 * second suite — or a second person, or a second agent — collides on 8080 and
 * gets "port taken", an error that says nothing about what they were doing.
 * Defaults are the firebase.json values, so nothing changes unless you ask.
 */
export const EMULATOR_PORTS = {
  firestore: Number(import.meta.env.VITE_EMULATOR_FIRESTORE_PORT ?? 8080),
  auth: Number(import.meta.env.VITE_EMULATOR_AUTH_PORT ?? 9099),
  storage: Number(import.meta.env.VITE_EMULATOR_STORAGE_PORT ?? 9199),
} as const
