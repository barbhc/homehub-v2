export {
  getChunksByManual,
  getChunksByItem,
  searchChunks,
  archiveChunk,
  reclassifyTaskAsChunk,
  logParseCorrection,
  getParseCorrections,
  convertTaskToChunk,
  convertChunkToTask,
  updateChunkSourcePages,
  saveFaq,
  getFaqsByHome,
  getFaqsByItem,
  deleteFaq,
  getKnowledgeChunksByHome,
  type ServiceResult,
  type ChunkWithItemMeta,
} from "./services/knowledgeService"

export {
  createManualDocument,
  updateManualLabel,
  ingestReference,
  getManualsByHome,
  getManualsByItem,
  deleteManualDocument,
  type CreateManualDocumentInput,
} from "./services/manualDocumentService"

export {
  listConversations,
  getConversationMessages,
  createConversation,
  appendMessage,
  renameConversation,
  touchConversation,
  toChatMessages,
  type ConversationSummary,
  type PersistedMessage,
} from "./services/conversationService"

export {
  startParse,
  watchParse,
  parseManualAndWait,
  previewManualParse,
  readPreviewDraft,
  commitReviewedDraft,
  toUiStage,
  type ParseManualResult,
  type PreviewManualResult,
  type CommitReviewedResult,
  type ParsedConfidence,
  type ParseStage,
  type ParseMode,
  type StartParseOpts,
} from "./services/parseManualService"
export { detectDocType, type DocType, type DocTypeResult } from "./services/detectDocTypeService"

export type {
  PreviewChunk,
  PreviewTask,
  PreviewResult,
  ChunkType,
  CareType,
  PriorityTier,
  RiskLevel,
  ScheduleType,
} from "./types/previewTypes"
