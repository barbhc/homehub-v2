import { useEffect, useState } from "react"
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore"
import { auth, db } from "@/integrations/firebase"
import { useAuth } from "@/modules/auth"

/**
 * The signed-in person's own name, and the one place that decides how to greet
 * someone we can't name.
 *
 * Home greeted every user as "Barb" — a hardcoded string, so the owner's name
 * appeared on her partner's phone and would have appeared on every tester's.
 * The fix needs a real name, and there wasn't one: users/{uid}.fullName was
 * null for BOTH existing accounts because nothing ever wrote it. Sign in with
 * Apple hands back a display name only on the very FIRST authorization, and
 * that value was being dropped on the floor.
 *
 * So this also seeds the profile: when the auth provider gave us a name and the
 * profile has none, store it once. Settings can still override it.
 *
 * Returns null when we genuinely don't know — callers must greet without a name
 * rather than invent one.
 */
export function useDisplayName(): { firstName: string | null; fullName: string | null } {
  const { user } = useAuth()
  const [fullName, setFullName] = useState<string | null>(null)

  useEffect(() => {
    const uid = user?.id
    if (!uid) { setFullName(null); return }
    let cancelled = false

    void (async () => {
      try {
        const ref = doc(db, `users/${uid}`)
        const snap = await getDoc(ref)
        const stored = (snap.exists() ? (snap.get("fullName") as string | null) : null) ?? null
        if (stored) { if (!cancelled) setFullName(stored) ; return }

        // Nothing stored — seed from whatever the auth provider gave us, once.
        const fromProvider =
          auth.currentUser?.displayName?.trim() ||
          (user.user_metadata?.full_name as string | undefined)?.trim() ||
          null
        if (!fromProvider) return
        await setDoc(ref, { fullName: fromProvider, updatedAt: serverTimestamp() }, { merge: true })
        if (!cancelled) setFullName(fromProvider)
      } catch {
        /* a missing name is a cosmetic problem — never block the page for it */
      }
    })()

    return () => { cancelled = true }
  }, [user?.id, user?.user_metadata?.full_name])

  const firstName = fullName ? fullName.trim().split(/\s+/)[0] : null
  return { firstName, fullName }
}
