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
export { sendTestPush, sendPushDaily } from "./push/sendPush.js"
export { completeTask } from "./tasks/completeTask.js"
export { acceptInvite, removeMember, getInviteDetails } from "./invites/inviteActions.js"
export { redeemInviteCode } from "./growth/redeemInviteCode.js"
export { generateTasks } from "./ai/generateTasks.js"
export { detectDocType } from "./ai/detectDocType.js"
export { ocr } from "./ai/ocr.js"
export { productLookup } from "./ai/productLookup.js"
export { chatQuery } from "./ai/chatQuery.js"
export { suggestCareNotes, importCareUrl } from "./ai/careSuggestions.js"
export { ingestReference } from "./ai/ingestReference.js"
export { classifyExistingTasks } from "./ai/classifyExistingTasks.js"
export { discussTask } from "./ai/discussTask.js"
export { searchProductImages } from "./products/searchProductImages.js"
export { findManual } from "./products/findManual.js"
export { checkRecalls } from "./products/checkRecalls.js"
export { proxyPdf } from "./media/proxyPdf.js"
