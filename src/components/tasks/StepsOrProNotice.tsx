import type { ReactNode } from "react"
import { stepsAllowedFor, type TaskActor } from "@/lib/taskActor"
import { ProTaskNotice } from "@/components/tasks/ProTaskNotice"

/**
 * The ONE "steps or pro notice" block — every surface that renders a task's
 * how-to steps goes through it (item page row, task page, Tasks rows on phone
 * and desktop, the clean guide, Deep Clean).
 *
 * Owner's standing rule: a homeowner is never shown DIY steps for gas,
 * combustion or live electrical work. Before this block only the item page
 * enforced it; "See details" on the same task from Home or Tasks showed the
 * numbered steps.
 *
 *  - hazardous → ProTaskNotice ("Leave this to a licensed professional"); the
 *    steps (`children`) are NOT rendered.
 *  - pro       → ProTaskNotice ("Best done by a professional"), then the steps,
 *    which read as what the tech checks.
 *  - diy       → the steps, unchanged.
 *
 * `between` renders after the notice and before the steps whatever the actor —
 * for content that is not DIY instruction (the item row's parts list).
 * Renders a fragment so it sits in the caller's own flex/gap layout.
 */
export function StepsOrProNotice({ actor, between, children }: {
  actor: TaskActor
  between?: ReactNode
  children?: ReactNode
}) {
  return (
    <>
      {actor !== "diy" && <ProTaskNotice actor={actor} />}
      {between}
      {stepsAllowedFor(actor) && children}
    </>
  )
}
