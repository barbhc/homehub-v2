import type { TaskTemplateWithSchedule } from "@/modules/care"

/**
 * Who should actually perform a task.
 *
 * Manuals (especially install/service manuals like a furnace's) mix homeowner
 * upkeep with professional commissioning steps. Presenting "loosen the gas
 * union until you smell gas" as a homeowner checkbox is wrong and unsafe, so
 * we classify each task and reframe pro/hazardous ones as "schedule a pro"
 * instead of a DIY checklist.
 *
 *  - "diy"        — a homeowner can safely do it (change the air filter).
 *  - "pro"        — needs a technician's tools/training (manometer, control
 *                   board, static pressure). Show steps as "what they'll check".
 *  - "hazardous"  — gas, combustion, or live electrical. NEVER show DIY steps;
 *                   show a safety notice and route to a professional.
 */
export type TaskActor = "diy" | "pro" | "hazardous"

// NOTE: no trailing \b on these — the alternatives are word STEMS (pip, valv,
// pressur, explos…) chosen to match inflections like "piping"/"valve"/
// "pressures". A trailing \b would require a boundary mid-word and silently
// fail to match (e.g. "gas piping" wouldn't classify as hazardous).

/** Acute gas / combustion / CO / explosion contexts — never DIY. */
const HAZARD_PATTERN =
  /\b(gas\s*(line|pip|valv|leak|pressur|odor|meter|union)|gas-?fired|carbon monoxide|\bco\b|open flame|explos|propane|natural gas)/i

/** Needs pro tools/expertise but not acutely hazardous. */
const PRO_PATTERN =
  /\b(manometer|static pressure|temperature rise|\bbtu\b|line voltage|\bvac\b|24\s*v\b|control board|blower speed|capacitor|amperage|rollout|limit switch|heat exchanger|refrigerant|combustion analysis|flue gas)/i

function taskText(task: TaskTemplateWithSchedule): string {
  const t = task as unknown as {
    title?: string
    instructions_override?: string | null
    description?: string | null
    justification?: string | null
  }
  return [t.title, t.instructions_override, t.description, t.justification]
    .filter(Boolean)
    .join(" ")
}

/**
 * Classify who should do a task, using signals already present on existing
 * rows (title/instructions/justification text + risk_level) — so this works on
 * already-parsed tasks with no re-parse. A future parser change can set this
 * authoritatively at the source.
 */
export function classifyTaskActor(task: TaskTemplateWithSchedule): TaskActor {
  return classifyActorFromText(taskText(task))
}

/**
 * Classify from already-joined task text — for callers (the feedback sheet's
 * safety pushback) that hold loose fields rather than a full task row.
 */
export function classifyActorFromText(text: string): TaskActor {
  if (HAZARD_PATTERN.test(text)) return "hazardous"
  if (PRO_PATTERN.test(text)) return "pro"
  return "diy"
}
