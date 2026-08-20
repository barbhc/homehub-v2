/**
 * Due windows — client-side re-export.
 *
 * The implementation lives in `shared/care/dueWindow.ts` so the push function
 * uses the SAME logic: a notification promising "3 things worth doing this
 * month" must agree with the screen it opens. This file only narrows the
 * schedule type to the client's `ScheduleType` union for call-site safety.
 */
export {
  todayStr, toleranceDays, dueWindow, dueKindOf, windowPhrase,
  isTrulyOverdue, safetyPhrase, shortDate,
  type DueKind, type WindowState, type DueWindow,
} from "../../shared/care/dueWindow"
