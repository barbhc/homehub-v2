import { getAuth, connectAuthEmulator } from "firebase/auth"
import { firebaseApp, USE_EMULATORS, EMULATOR_PORTS } from "./app"

export const auth = getAuth(firebaseApp)

if (USE_EMULATORS) {
  connectAuthEmulator(auth, `http://127.0.0.1:${EMULATOR_PORTS.auth}`, { disableWarnings: true })
}
