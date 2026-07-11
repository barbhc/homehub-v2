import { getStorage, connectStorageEmulator } from "firebase/storage"
import { firebaseApp, USE_EMULATORS } from "./app"

export const storage = getStorage(firebaseApp)

if (USE_EMULATORS) {
  connectStorageEmulator(storage, "127.0.0.1", 9199)
}
