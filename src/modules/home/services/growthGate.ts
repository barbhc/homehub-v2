import { doc, getDoc } from "firebase/firestore"
import { db, callable } from "@/integrations/firebase"

/**
 * The client half of the invite gate.
 *
 * The gate is ENFORCED in firestore.rules (creating a home requires an
 * admissions/{uid} doc). Everything here is presentation: knowing whether to
 * show the code field, and turning a rules rejection into a sentence. Nothing
 * in this file is load-bearing for the gate — a user who patches it out still
 * cannot create a home.
 */

export type GateStatus = { gateOn: boolean; admitted: boolean }

const redeem = callable<{ code: string }, { ok: true; alreadyAdmitted: boolean }>("redeemInviteCode")

/**
 * Is the gate on, and is this user already through it?
 *
 * Fails OPEN — a read error here reports the gate as off, so a transient
 * Firestore hiccup shows the normal form rather than an invite prompt the user
 * has no code for. The rules still refuse the write, so the worst case is a
 * clear rejection instead of a wrong-looking screen.
 */
export async function getGateStatus(uid: string): Promise<GateStatus> {
  try {
    const [cfg, adm] = await Promise.all([
      getDoc(doc(db, "config/growth")),
      getDoc(doc(db, `admissions/${uid}`)),
    ])
    return {
      gateOn: cfg.exists() && cfg.get("inviteGateEnabled") === true,
      admitted: adm.exists(),
    }
  } catch (err) {
    console.warn("[growthGate] status read failed; treating the gate as off", err)
    return { gateOn: false, admitted: false }
  }
}

/**
 * Redeem a code. Throws with a user-facing message on refusal — the callable
 * writes the copy so the reasons stay in one place with the rule that produced
 * them, rather than being reconstructed from an error code on the client.
 */
export async function redeemInviteCode(code: string): Promise<void> {
  await redeem({ code })
}
