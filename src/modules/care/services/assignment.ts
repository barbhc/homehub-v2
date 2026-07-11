/**
 * Pure helpers for task assignment (Phase 3).
 *
 * The DB enforces the hard invariant (an assignee must be a home member, via
 * the `enforce_assignee_membership` trigger). These helpers let the UI decide
 * *whether* to show the Assignment control and *which* ids are offerable, and
 * let us validate before a round-trip — mirroring how Phase 1 kept the
 * recurrence math in a pure, unit-tested helper alongside the RPC.
 */

/**
 * The Assignment control only appears once a home has more than one member —
 * assigning a solo home to yourself is noise.
 */
export function canAssignTasks(memberCount: number): boolean {
  return memberCount > 1
}

/**
 * True when `assigneeId` is a member of the home. `null` (unassigned) is always
 * valid. Used to pre-validate and to filter a stale selection out of the UI.
 */
export function isValidAssignee(
  assigneeId: string | null | undefined,
  memberIds: readonly string[]
): boolean {
  if (assigneeId == null) return true
  return memberIds.includes(assigneeId)
}

/**
 * Resolves the assignee a newly generated occurrence should inherit, mirroring
 * the SQL in `complete_task_instance`: the first *current member* among
 * [template default, just-completed instance's assignee], else `null`. Each
 * candidate is membership-checked independently so a stale default (e.g. a
 * member who left) falls back to the previous assignee rather than propagating
 * a dangling assignment — which would otherwise trip the membership trigger.
 */
export function resolveInheritedAssignee(
  templateDefault: string | null | undefined,
  previousAssignee: string | null | undefined,
  memberIds: readonly string[]
): string | null {
  for (const candidate of [templateDefault, previousAssignee]) {
    if (candidate != null && memberIds.includes(candidate)) return candidate
  }
  return null
}
