/**
 * Homehub v2 Cloud Functions (2nd gen, Node 20).
 *
 * Phase 3: parse pipeline — enqueueParse callable + parseWorker (onTaskDispatched,
 *   timeoutSeconds 1800). Worker logic lives in the testable runParse core.
 */
import { initializeApp } from "firebase-admin/app"

initializeApp()

export { enqueueParse } from "./parse/enqueueParse.js"
export { parseWorker } from "./parse/parseWorker.js"
export { commitManualDraft } from "./parse/commitManualDraft.js"
export { rollForwardNeverStarted } from "./schedule/rollForward.js"
export { graduateFeedback } from "./schedule/graduateFeedback.js"
export { retryAwaitingCapacity } from "./schedule/retryAwaitingCapacity.js"
// previewDigest was removed (2026-09-30): an unmetered whole-app read any
// member could trigger, with no caller. Deploying this does not delete it —
// `firebase functions:delete previewDigest --project homehub-2068d`.
export { sendTestPush, sendPushSweep } from "./push/sendPush.js"
export { completeTask } from "./tasks/completeTask.js"
export { acceptInvite, removeMember, getInviteDetails } from "./invites/inviteActions.js"
export { redeemInviteCode } from "./growth/redeemInviteCode.js"
// generateTasks, suggestCareNotes and importCareUrl were retired (2026-09-30,
// dead-code sweep): their only client callers — the never-called
// planGenerationService, and the URL-only /faq page — were deleted, and the
// deployed functions were deleted from homehub-2068d after the hosting deploy
// that removed those callers (2026-10-01 02:07Z, `firebase functions:delete`).
export { detectDocType } from "./ai/detectDocType.js"
export { ocr } from "./ai/ocr.js"
export { productLookup } from "./ai/productLookup.js"
export { chatQuery } from "./ai/chatQuery.js"
export { ingestReference } from "./ai/ingestReference.js"
export { classifyExistingTasks } from "./ai/classifyExistingTasks.js"
export { discussTask } from "./ai/discussTask.js"
export { proposeReminders } from "./ai/proposeReminders.js"
export { searchProductImages } from "./products/searchProductImages.js"
export { findManual } from "./products/findManual.js"
export { checkRecalls } from "./products/checkRecalls.js"
export { proxyPdf } from "./media/proxyPdf.js"
