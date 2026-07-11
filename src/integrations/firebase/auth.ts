import { getAuth, connectAuthEmulator } from "firebase/auth"
import { firebaseApp, USE_EMULATORS } from "./app"

export const auth = getAuth(firebaseApp)

if (USE_EMULATORS) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true })
}
