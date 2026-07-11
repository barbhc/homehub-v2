/**
 * parseWorker — the Cloud Tasks worker (2nd gen, timeoutSeconds 1800). This is
 * the reason for the whole migration: Supabase edge isolates hard-kill at 150s
 * while real parses take 144–241s; a 1800s worker removes the ceiling. The
 * handler is a thin wrapper — all logic lives in the testable `runParse` core.
 *
 * retryConfig.maxAttempts: 2 — one retry for transient failures. The requestId
 * idempotency key on the manual makes a redelivery safe (commitDraft no-ops if
 * the same requestId already committed).
 */
import { onTaskDispatched } from "firebase-functions/v2/tasks"
import { defineSecret } from "firebase-functions/params"
import { getFirestore } from "firebase-admin/firestore"
import { runParse } from "./runParse.js"
import { makeCallClaude } from "./anthropic.js"
import { makeFetchPdf } from "./storagePdf.js"
import type { ParseMode } from "./parseTypes.js"

const REGION = "us-central1"
const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY")

export const parseWorker = onTaskDispatched(
  {
    region: REGION,
    secrets: [ANTHROPIC_API_KEY],
    timeoutSeconds: 1800,
    memory: "1GiB",
    retryConfig: { maxAttempts: 2, minBackoffSeconds: 10 },
    rateLimits: { maxConcurrentDispatches: 2 },
  },
  async (req) => {
    const { homeId, manualId, requestId, mode } = req.data as {
      homeId: string
      manualId: string
      requestId: string
      mode: ParseMode
    }
    const db = getFirestore()
    const outcome = await runParse(
      db,
      { callClaude: makeCallClaude(ANTHROPIC_API_KEY.value()), fetchPdf: makeFetchPdf() },
      { homeId, manualId, requestId, mode }
    )
    // A terminal "error" is recorded on the manual for diagnosis; throwing here
    // would trigger the (bounded) Cloud Tasks retry. We only rethrow for
    // pre-commit failures worth retrying; a committed/preview run is terminal.
    if (outcome.stage === "error") {
      throw new Error(`parse ${manualId} failed: ${outcome.error}`)
    }
  }
)
