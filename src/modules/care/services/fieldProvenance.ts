/**
 * The web-SDK side of per-field provenance (shared/tasks/fieldProvenance.ts —
 * read its header for the shape and the who-counts-as-what rule).
 *
 * Every client writer of a template's priorityTier / schedule / remindEnabled
 * / careType spreads one of these into the SAME write that changes the value,
 * stamping exactly the fields it changes. Nothing reads provenance yet (step 1
 * of decision C), so these change no behaviour a person can see.
 */
import { serverTimestamp, type FieldValue } from "firebase/firestore"
import { auth } from "@/integrations/firebase"
import {
  provenancePatch,
  type FieldSources,
  type ProvenanceActor,
  type ProvenanceValues,
  type ProvenanceVia,
} from "../../../../shared/tasks/fieldProvenance"

export type FieldSourcesPatch = { fieldSources?: FieldSources<FieldValue> }

/** The signed-in member, as a provenance actor. Throws rather than stamping a
 *  user edit with no one behind it — every caller is a signed-in screen, and
 *  the write would be refused by the rules anyway. */
export function memberActor(): ProvenanceActor {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error("You're signed out. Sign in again to save this change.")
  return { by: "user", uid }
}

/** Stamps `values` as set by `actor` (default: the signed-in member). */
export function stamp(
  via: ProvenanceVia,
  values: Partial<ProvenanceValues>,
  actor?: ProvenanceActor,
): FieldSourcesPatch {
  // Nothing to stamp → no actor needed (an editor writing only other fields).
  if (Object.keys(values).length === 0) return {}
  return provenancePatch(actor ?? memberActor(), via, values, serverTimestamp())
}

/** Stamps `values` as a rule or default nobody chose for this task. */
export function systemStamp(via: ProvenanceVia, values: Partial<ProvenanceValues>): FieldSourcesPatch {
  return provenancePatch({ by: "system" }, via, values, serverTimestamp())
}
