import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore"
import { db } from "@/integrations/firebase"

/**
 * A person's public display name, on `users/{uid}.fullName`. An absent doc or
 * a name that is not text reads as "" (no name set).
 */
export async function getDisplayName(userId: string): Promise<string> {
  const snap = await getDoc(doc(db, `users/${userId}`))
  const stored: unknown = snap.exists() ? snap.get("fullName") : null
  return typeof stored === "string" ? stored : ""
}

/** Saves the name ("" clears it). A merge, so it creates the doc if it is missing. */
export async function setDisplayName(userId: string, name: string): Promise<void> {
  await setDoc(doc(db, `users/${userId}`), { fullName: name || null, updatedAt: serverTimestamp() }, { merge: true })
}
