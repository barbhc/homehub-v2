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

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? "demo-api-key",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? "demo-homehub.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "demo-homehub",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? "demo-homehub.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "0",
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? "demo-app-id",
}

export const firebaseApp: FirebaseApp = initializeApp(firebaseConfig)
