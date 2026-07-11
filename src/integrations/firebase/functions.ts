import { getFunctions, connectFunctionsEmulator, httpsCallable } from "firebase/functions"
import { firebaseApp, USE_EMULATORS } from "./app"

export const functions = getFunctions(firebaseApp)

if (USE_EMULATORS) {
  connectFunctionsEmulator(functions, "127.0.0.1", 5001)
}

/** Typed callable helper: `const fn = callable<Req, Res>("name"); await fn(data)`. */
export function callable<Req, Res>(name: string) {
  const fn = httpsCallable<Req, Res>(functions, name)
  return async (data: Req): Promise<Res> => {
    const result = await fn(data)
    return result.data
  }
}
