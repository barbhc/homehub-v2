/**
 * Moved to shared/tasks so the push functions can apply the SAME definition —
 * the owner's phone said "22 tasks due today" while Home showed 3, because
 * sendPushDaily counted raw instances and never applied this filter. The
 * docstring has always promised it covers "proactive alerts"; now it does.
 */
export { isAgendaEligible, type AgendaEligible } from "../../shared/tasks/agendaEligibility"
