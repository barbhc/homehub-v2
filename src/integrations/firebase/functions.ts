import { getFunctions, connectFunctionsEmulator, httpsCallable } from "firebase/functions"
import { firebaseApp, USE_EMULATORS } from "./app"

const REGION = "us-central1"
export const functions = getFunctions(firebaseApp, REGION)

if (USE_EMULATORS) {
  connectFunctionsEmulator(functions, "127.0.0.1", 5001)
}

/**
 * Absolute URL for an onRequest (non-callable) HTTPS function. Callables go
 * through `callable()`; streaming functions (e.g. chatQuery/SSE) need a raw URL.
 */
export function functionUrl(name: string): string {
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "demo-homehub"
  return USE_EMULATORS
    ? `http://127.0.0.1:5001/${projectId}/${REGION}/${name}`
    : `https://${REGION}-${projectId}.cloudfunctions.net/${name}`
}

/** Typed callable helper: `const fn = callable<Req, Res>("name"); await fn(data)`. */
export function callable<Req, Res>(name: string) {
  const fn = httpsCallable<Req, Res>(functions, name)
  return async (data: Req): Promise<Res> => {
    const result = await fn(data)
    return result.data
  }
}
