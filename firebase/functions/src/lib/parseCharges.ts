/**
 * The ledger that lets a manual scan be refunded by a process that did not
 * charge it.
 *
 * A scan is charged in `enqueueParse` (or `retryAwaitingCapacity`), then runs in
 * `parseWorker` — a different process, minutes later — and may be ended by the
 * stalled-parse sweep in yet another. The in-memory `QuotaHold` cannot cross
 * that gap, so the charge is written down, one document per run, keyed by the
 * run's requestId:
 *
 *   parseCharges/{requestId}  { uid, fn, units, day, month, homeId, manualId, state, … }
 *
 * SERVER-ONLY (firestore.rules denies every client). That is load-bearing, not
 * tidiness: the manual document is member-writable, so a charge recorded THERE
 * could be edited — `units: 10000` on your own manual, and the next refund
 * would have zeroed your day and knocked 10,000 units off the app's monthly
 * counter.
 *
 * `state` is the idempotency key and the refund rule, in one field:
 *
 *   held      charged, Claude not called yet     → refundable by anyone who
 *                                                  knows the run is dead
 *   vendor    the Claude call has started         → refundable ONLY by the
 *                                                  worker, which knows whether
 *                                                  the call produced anything
 *   billed    Claude answered — money spent       → never refunded
 *   refunded  given back                          → terminal
 *
 * Every transition is a transaction on this document, so two processes can
 * never refund one charge twice.
 */
import { FieldValue, Timestamp, type Firestore, type Transaction } from "firebase-admin/firestore"
import { z } from "zod"
import { counterRefs, writeRefund, type ChargeRecord } from "./quota.js"
import { DocId, readStored } from "./validate.js"

export const PARSE_CHARGE_STATES = ["held", "vendor", "billed", "refunded"] as const
export type ParseChargeState = (typeof PARSE_CHARGE_STATES)[number]
const StateSchema = z.enum(PARSE_CHARGE_STATES)

/**
 * A ledger entry as a refund reads it (H3a §3). Server-written, but a refund
 * turns these fields into counter writes and paths — `usage/{uid}/daily/{day}`
 * — so they are parsed, not trusted: an entry of the wrong shape is logged and
 * refunds nothing, rather than writing a NaN or a stray path.
 */
const StoredCharge = z.object({
  state: StateSchema,
  uid: DocId,
  fn: z.string().min(1).max(100),
  units: z.number().int().positive(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  month: z.string().regex(/^\d{4}-\d{2}$/),
})

export const PARSE_CHARGES = "parseCharges"

const ref = (db: Firestore, requestId: string) => db.doc(`${PARSE_CHARGES}/${requestId}`)

/** Kept for a month, then eligible for a TTL policy on `expiresAt`. */
const RETENTION_MS = 30 * 86_400_000

/**
 * Write the ledger entry for a new run — inside the transaction that claims
 * the manual, so a charge is never recorded for a run that did not start.
 */
export function recordParseCharge(
  tx: Transaction,
  db: Firestore,
  requestId: string,
  record: ChargeRecord,
  where: { homeId: string; manualId: string },
): void {
  tx.set(ref(db, requestId), {
    ...record,
    ...where,
    state: "held" satisfies ParseChargeState,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + RETENTION_MS),
  })
}

/**
 * Move a charge from `from` to `to`. Returns the state it was found in (null
 * when there is no ledger entry — a run enqueued before the ledger existed).
 */
async function transition(
  db: Firestore,
  requestId: string,
  from: ParseChargeState[],
  to: ParseChargeState,
): Promise<ParseChargeState | null> {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref(db, requestId))
    if (!snap.exists) return null
    // Not one of the four states reads as "no entry": nothing moves, and the
    // caller proceeds exactly as it would for a run that predates the ledger.
    const parsed = StateSchema.safeParse(snap.get("state"))
    if (!parsed.success) return null
    const state = parsed.data
    if (from.includes(state)) {
      tx.set(ref(db, requestId), { state: to, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    }
    return state
  })
}

/**
 * Called by the worker right BEFORE the Claude call. From here on nobody but
 * the worker may refund this charge, because only it can know whether the
 * call produced anything. Returns what the ledger said: "refunded" means the
 * run was already written off (the stalled-parse sweep got there first) and
 * the worker must not spend money on it.
 */
export async function markParseChargeVendor(db: Firestore, requestId: string): Promise<ParseChargeState | null> {
  return transition(db, requestId, ["held"], "vendor")
}

/**
 * Called by the worker once Claude has answered: this charge is spent and can
 * never be refunded. Bookkeeping must not cost the user a finished parse, so a
 * failure here is logged, not thrown — the entry stays `vendor`, which nothing
 * but the worker refunds anyway.
 */
export async function markParseChargeBilled(db: Firestore, requestId: string): Promise<void> {
  try {
    await transition(db, requestId, ["held", "vendor"], "billed")
  } catch (err) {
    console.error(`[parseCharges] could not mark ${requestId} billed (it stays unrefundable by the sweep):`, err)
  }
}

/**
 * Give a run's charge back — once — if its ledger entry is in one of `from`.
 * Returns true when this call did the refund.
 *
 * Never throws: every caller is already handling the failure that prompted
 * the refund, and a bookkeeping error must not replace it. Logged with what is
 * needed to reconcile by hand.
 */
export async function refundParseCharge(
  db: Firestore,
  requestId: string,
  opts: { from: ParseChargeState[]; reason: string },
): Promise<boolean> {
  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref(db, requestId))
      if (!snap.exists) return false
      const entry = readStored("refundParseCharge", snap.ref.path, StoredCharge, snap.data())
      if (!entry || !opts.from.includes(entry.state)) return false
      const record: ChargeRecord = { uid: entry.uid, fn: entry.fn, units: entry.units, day: entry.day, month: entry.month }
      const refs = counterRefs(db, record)
      const [daily, monthly] = await Promise.all([tx.get(refs.daily), tx.get(refs.monthly)])
      writeRefund(tx, db, record, record.units, { daily, monthly }, { wholeCall: true })
      tx.set(
        ref(db, requestId),
        { state: "refunded" satisfies ParseChargeState, refundReason: opts.reason, updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      )
      return true
    })
  } catch (err) {
    console.error(`[parseCharges] refund of ${requestId} failed (${opts.reason}):`, err)
    return false
  }
}
