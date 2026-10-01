export {
  getCareNotesByItem,
  createCareNote,
  updateCareNote,
  deleteCareNote,
  getHomeNotes,
  promoteLegacyItemNote,
  clearLegacyItemNote,
} from "./services/careNoteService"

export {
  updateTaskSchedule,
  updateTaskNotes,
  type ScheduleInput,
} from "./services/taskScheduleService"

export {
  createTaskTemplate,
  getTaskTemplates,
  getTaskTemplatesByItem,
  getTaskTemplatesWithSchedulesByItem,
  type TaskTemplateWithSchedule,
  type TaskSupplyEmbed,
  getTaskInstances,
  getTaskInstancesForItem,
  getTaskDetail,
  type TaskDetail,
  updateTaskInstance,
  markTaskInstanceDone,
  snoozeTaskInstance,
  deleteTaskTemplate,
  archiveTaskTemplate,
  updateTaskCareType,
  setTaskReminder,
  setTaskCadence,
  updateTaskSupply,
  addTaskSupply,
  getSupplyPlaces,
  type TaskSupplyPatch,
  computePriorityScore,
  type CreateTaskTemplateInput,
  type UpdateTaskInstanceInput,
  type MarkDoneResult,
  type SnoozeResult,
  type DeleteTaskTemplateResult,
  type ArchiveTaskTemplateResult,
  type ServiceResult,
  type TaskInstanceWithDetails,
  updateTaskDiagramPages,
  updateTaskContent,
  rescheduleTaskInstance,
  unsnoozeTaskInstance,
  type TaskContentEdit,
  getCompletionHistory,
  logTaskCompletion,
  getTierChangeHistory,
  type CompletionHistoryEntry,
  type TierChangeHistoryEntry,
} from "./services/taskService"

export {
  getScheduleRulesByTemplate,
  createScheduleRule,
  generateTaskInstances,
  plannedInstanceDue,
  type CreateScheduleRuleInput,
  type GenerateInstancesInput,
} from "./services/scheduleService"

export { computeNextDueDate } from "./services/nextDueDate"

export {
  getFeedbackContext,
  submitTaskFeedback,
  listHouseRules,
  deleteHouseRule,
  discussTask,
  proposalToResolution,
  type FeedbackChip,
  type Resolution,
  type HouseRule,
  type HouseRuleKind,
  type SimilarTask,
  type FeedbackContext,
  type SubmitFeedbackInput,
  type SubmitFeedbackResult,
  type RuleMatch,
  type DiscussMessage,
  type DiscussProposal,
  type DiscussResult,
} from "./services/taskFeedbackService"

export { assignTaskInstance } from "./services/taskService"

export {
  canAssignTasks,
  isValidAssignee,
  resolveInheritedAssignee,
} from "./services/assignment"

export {
  taskSource,
  effortToMinutes,
  frequencyToSchedule,
  type TaskSource,
} from "./services/taskMapping"

export {
  getWeekAgenda,
  type WeekAgendaResult,
  type AgendaWithheld,
  createTasksFromEditable,
  type WeekAgendaItem,
  type EditableTaskInput,
  type CreateTasksResult,
} from "./services/weekAgenda"
export {
  proposeReminders,
  type ProposedReminder,
  type ProposeRemindersResponse,
} from "./services/proposeReminders"
export {
  getWeekReminders,
  type WeekReminder,
  type WeekRemindersResult,
} from "./services/weekReminders"

export {
  getHomeUpkeep,
  type HomeUpkeepItem,
} from "./services/homeUpkeep"

export {
  toggleShoppingStatus,
  addShoppingItem,
  listShoppingItems,
  setShoppingItemStatus,
  removeShoppingItem,
  type AddShoppingItemInput,
} from "./services/shoppingListService"
export { addLibraryTask,
  addCustomHomeTask, dismissLibrarySuggestion, applyLibraryBackstop, libraryKeyOf, LIBRARY_KEY_PREFIX } from "./services/careSuggestionService"
