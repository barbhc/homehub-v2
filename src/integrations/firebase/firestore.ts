import {
  getFirestore,
  connectFirestoreEmulator,
  collection,
  doc,
  type CollectionReference,
  type DocumentReference,
  type DocumentData,
} from "firebase/firestore"
import { firebaseApp, USE_EMULATORS, EMULATOR_PORTS } from "./app"

export const db = getFirestore(firebaseApp)

if (USE_EMULATORS) {
  connectFirestoreEmulator(db, "127.0.0.1", EMULATOR_PORTS.firestore)
}

/**
 * Typed ref helpers. Path shapes follow docs/firestore-model.md (Phase 2 is the
 * authority for collection layout); the generic parameter is one of the curated
 * types from "@/integrations/types" so call sites keep v1's type names.
 *
 * NOTE: these are thin casts, not converters — Timestamp↔string conversion is
 * handled in the service layer during the Phase 5 swap, where each service
 * decides its date representation (v1 services traffic in ISO strings).
 */
export function collRef<T = DocumentData>(path: string, ...segments: string[]): CollectionReference<T> {
  return collection(db, path, ...segments) as CollectionReference<T>
}

export function docRef<T = DocumentData>(path: string, ...segments: string[]): DocumentReference<T> {
  return doc(db, path, ...segments) as DocumentReference<T>
}
