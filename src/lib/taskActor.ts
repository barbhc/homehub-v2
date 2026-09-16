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

/**
 * The manual's own words for "this is a technician's job".
 *
 * A dryer's manual says the exhaust duct is cleaned "by a qualified
 * technician"; the parsed task carried that sentence and still classified as
 * DIY, so the owner got a checklist where the app should have offered a pro
 * (HH-152, 2026-09-05). The patterns above only know a technician's TOOLS;
 * this one knows the manual's VERBS — "have it done by", "hire", "must be
 * performed by", "not user-serviceable".
 *
 * Matched as directives on purpose. A troubleshooting fallback in an otherwise
 * homeowner task — "if the noise persists, contact a qualified technician" —
 * must not flip the whole task to pro, so a match inside an "if / persists /
 * still" sentence is ignored (see isFallbackAdvice).
 */
const PRO_PERSON =
  "(?:technician|professional|electrician|plumber|installer|contractor|servicer|dealer|" +
  "service (?:agent|center|centre|provider|company|technician|person|personnel)|" +
  "hvac (?:tech|technician|contractor|professional))"
const PRO_QUALIFIER = "(?:qualified|licensed|certified|trained|authori[sz]ed|professional|experienced|competent)"
const PRO_DIRECTIVE_PATTERN = new RegExp(
  [
    // "by a qualified technician", "by an authorized servicer", "by your dealer"
    `\\bby (?:a|an|your|the) (?:${PRO_QUALIFIER} )?${PRO_PERSON}\\b`,
    // "hire / call / contact / schedule / have a (qualified) technician"
    `\\b(?:hire|call|contact|schedule|arrange for|consult|have|use|employ) (?:a|an|your|the) (?:${PRO_QUALIFIER} )?${PRO_PERSON}\\b`,
    // "qualified technician only", "professional service is required"
    `\\b${PRO_QUALIFIER} ${PRO_PERSON} (?:only|is required|is recommended|should|must)\\b`,
    `\\bprofessional(?:ly)? (?:service|servicing|installation|installed|inspection|inspected|cleaning|cleaned|maintenance)\\b`,
    // The manual closing the door on the owner outright.
    `\\bnot (?:a )?user[- ]serviceable\\b`,
    `\\bdo not attempt to (?:service|repair|disassemble|open)\\b`,
  ].join("|"),
  "gi",
)

/** Words that turn a pro directive into fallback advice about a symptom. */
const FALLBACK_LEAD = /\b(?:if|persists?|still|unable|cannot|can't|fails?|failure|problem|trouble|otherwise|doubt)\b/i

/**
 * True when the match at `index` sits in a sentence that leads with a
 * condition — "If drying takes longer, contact a technician" — which is advice
 * for a symptom, not who does the task.
 */
function isFallbackAdvice(text: string, index: number): boolean {
  const sentenceStart = Math.max(
    text.lastIndexOf(". ", index), text.lastIndexOf("; ", index),
    text.lastIndexOf("! ", index), text.lastIndexOf("? ", index), text.lastIndexOf("\n", index),
  )
  return FALLBACK_LEAD.test(text.slice(sentenceStart + 1, index))
}

/** The manual tells the owner, in so many words, to bring in a professional. */
function hasProDirective(text: string): boolean {
  PRO_DIRECTIVE_PATTERN.lastIndex = 0
  for (let m = PRO_DIRECTIVE_PATTERN.exec(text); m; m = PRO_DIRECTIVE_PATTERN.exec(text)) {
    if (!isFallbackAdvice(text, m.index)) return true
  }
  return false
}

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
  if (hasProDirective(text)) return "pro"
  return "diy"
}
