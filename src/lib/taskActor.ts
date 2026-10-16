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

/**
 * Acute gas / combustion / CO / live-electrical / refrigerant work — never DIY.
 * Written so the TITLE alone catches the common jobs ("Relight the pilot",
 * "Replace the thermocouple", "Replace a light switch"), because a title is
 * often all a row has. Each line is pinned by the table in taskActor.test.ts,
 * which also holds the safe look-alikes it must NOT catch ("Clean the gas range
 * grates", "Test the CO alarm", "Reset a tripped breaker", "Test GFCI outlets").
 */
const HAZARD_PATTERNS: RegExp[] = [
  // Gas: lines, valves, leaks, the smell of it, supply/shut-off hardware.
  /\bgas\s*(line|pip|valv|leak|pressur|odor|smell|meter|union|supply|shut|cock|control|connector|hose|fitting|burner)/i,
  /\bsmell(s|ing)?\s+(of\s+)?gas\b/i,
  /\bgas-?fired|\bopen flame|\bexplos|\bpropane|\bnatural gas/i,
  // CO itself — but testing the CO alarm is a homeowner's job.
  /\bcarbon monoxide(?!\s+(detector|alarm|sensor|monitor))|\bco\b(?!\s*(detector|alarm|sensor|monitor))/i,
  // Ignition and flame proving on gas appliances.
  /\bpilot\b|\bthermocouple|\bthermopile|\bflame\s*(sensor|rod|probe)|\bignit(er|or)\b|\bhot surface ignit|\bspark ignit/i,
  // Furnace / boiler / water-heater burners (a range's burner caps are cleaning).
  /\b(main|furnace|boiler|water heater)\s+burners?\b|\bburners?\b[^.]{0,30}\b(furnace|boiler|water heater)\b|\bburner\s*(assembly|orifice|manifold|adjust)/i,
  // Combustion, flue and venting work (looking at the vent stays DIY).
  /\bcombustion\s*(chamber|analysis|test|adjust|startup|start-up|air adjust)|\bflue\b|\bdraft\s*(hood|inducer)|\bback-?draft|\bspillage\b/i,
  /\b(repair|replace|reconnect|disconnect|re-?seal|seal|install|remove|adjust)\b[^.]{0,30}\b(vent\s*(pipe|connector)|venting|chimney liner)/i,
  // Live electrical: wiring and replacing fixed devices (testing a GFCI is DIY).
  /\bwiring\b|\brewir|\b(live|exposed|bare|hot)\s+wires?\b|\bwire\s+(nut|connection)s?\b|\bline voltage\b|\bhigh voltage\b/i,
  /\b(replace|install|wire|swap|change|repair)\b[^.]{0,25}\b(outlet|receptacle|light switch|wall switch|dimmer|light fixture|ceiling fan|hardwired)/i,
  // Refrigerant (an EPA-certified job; "refrigerator" does not match).
  /\brefrigerant|\bfreon\b|\brecharge\b[^.]{0,20}\b(a\/?c|air conditioner|system|refrigerant)/i,
]

/** An electrical panel, as a place someone WORKS in (see hasPanelWork). */
const PANEL = /\b(electrical|breaker|service|main|fuse|circuit)\s+(panel|box)|\bload center\b|\bpanel\s*board\b/i
/** A sentence that only uses the panel to cut power or reset — homeowner-safe. */
const PANEL_SAFE_USE = /\b(reset|tripp?ed|flip|turn(ing)?\s+off|switch(ing)?\s+off|shut(ting)?\s+off|power\s+off|disconnect power|locate|label)\b/i

/**
 * Work inside an electrical panel is hazardous; "turn off power at the breaker
 * panel before cleaning the disposal" is the safety pre-step of a DIY task, and
 * "Reset a tripped breaker" is the homeowner's own job. Judged per sentence.
 */
function hasPanelWork(text: string): boolean {
  return text
    .split(/(?<=[.!?;\n])\s+/)
    .some((s) => PANEL.test(s) && !PANEL_SAFE_USE.test(s))
}

function isHazardText(text: string): boolean {
  return HAZARD_PATTERNS.some((p) => p.test(text)) || hasPanelWork(text)
}

/** Needs pro tools/expertise but not acutely hazardous. */
const PRO_PATTERN =
  /\b(manometer|static pressure|temperature rise|\bbtu\b|\bvac\b|24\s*v\b|control board|blower speed|capacitor|amperage|rollout|limit switch|heat exchanger)/i

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

/**
 * A task's own words, in whatever shape a surface holds them — the item page's
 * template row, the task page's and Tasks rows' `TaskDetail` (`notes` is the
 * template's instructions_override), a clean guide's step. Every surface that
 * shows a task's steps classifies through `classifyTaskFields`, so one task
 * gets one answer wherever it is opened. Structured `steps` count: they are
 * the words the homeowner would read, so a hazard named only in a step still
 * suppresses the steps.
 */
export type TaskActorFields = {
  title?: string | null
  /** instructions_override / TaskDetail.notes / a clean task's instructions. */
  instructions?: string | null
  description?: string | null
  justification?: string | null
  steps?: readonly string[] | null
}

/** Classify who should do a task from its fields (see TaskActorFields). */
export function classifyTaskFields(f: TaskActorFields): TaskActor {
  return classifyActorFromText(
    [f.title, f.instructions, f.description, f.justification, ...(f.steps ?? [])].filter(Boolean).join(" "),
  )
}

/** A `TaskDetail` (task page, Tasks rows): `notes` is the template's instructions_override. */
export function classifyTaskDetail(d: {
  title: string
  notes: string | null
  justification: string | null
  steps: readonly string[] | null
}): TaskActor {
  return classifyTaskFields({ title: d.title, instructions: d.notes, justification: d.justification, steps: d.steps })
}

/**
 * THE rule for every surface that renders a task's how-to steps (owner,
 * standing): a homeowner is never shown DIY steps for gas, combustion or live
 * electrical work. Hazardous → no steps; pro → steps, framed as what the tech
 * checks; DIY → steps. `StepsOrProNotice` is the block that applies it.
 */
export function stepsAllowedFor(actor: TaskActor): boolean {
  return actor !== "hazardous"
}

/**
 * Classify who should do a task, using signals already present on existing
 * rows (title/instructions/justification text + risk_level) — so this works on
 * already-parsed tasks with no re-parse. A future parser change can set this
 * authoritatively at the source.
 */
export function classifyTaskActor(task: TaskTemplateWithSchedule): TaskActor {
  const t = task as unknown as {
    title?: string
    instructions_override?: string | null
    description?: string | null
    justification?: string | null
  }
  return classifyTaskFields({
    title: t.title,
    instructions: t.instructions_override,
    description: t.description,
    justification: t.justification,
  })
}

/**
 * Classify from already-joined task text — for callers (the feedback sheet's
 * safety pushback) that hold loose fields rather than a full task row.
 */
export function classifyActorFromText(text: string): TaskActor {
  if (isHazardText(text)) return "hazardous"
  if (PRO_PATTERN.test(text)) return "pro"
  if (hasProDirective(text)) return "pro"
  return "diy"
}
