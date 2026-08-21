/**
 * Shared parse-manual prompt — THE single source of truth for manual extraction.
 *
 * Imported by the parse-manual edge function AND the offline eval harness
 * (scripts/parse-eval), so prompt changes are made in exactly one place and can
 * be regression-tested against the golden corpus before deploying. Keep this
 * module dependency-free (no Deno/node imports) so both runtimes can load it.
 */

export interface ParseCorrection {
  original_type: string
  corrected_type: string
  item_title: string
}

export function buildPrompt(accessories?: string[], corrections?: ParseCorrection[], existingTitles?: string[]): string {
  const accessoryNote = accessories && accessories.length > 0
    ? `\nThe user has confirmed they own these optional accessories: ${accessories.join(", ")}. Tag chunks for these accessories with "optional-accessory" + the accessory name. For accessories NOT in this list, still extract the content but add the "optional-accessory" tag so it can be filtered.`
    : ""

  let correctionNote = ""
  if (corrections && corrections.length > 0) {
    const examples = corrections.slice(0, 15).map(
      (c) => `- "${c.item_title}" should be ${c.corrected_type}, not ${c.original_type}`
    ).join("\n")
    correctionNote = `\n\nIMPORTANT — This user has previously corrected classifications. Learn from these:\n${examples}\nApply these patterns to similar items in this manual.`
  }

  let fillGapsNote = ""
  if (existingTitles && existingTitles.length > 0) {
    fillGapsNote = `\n\nFILL-GAPS MODE: The following topics are ALREADY extracted — do NOT re-extract them:\n${existingTitles.map((t) => `- ${t}`).join("\n")}\nSkip Quick Start / Quick Guide sections (already covered). Focus on sections of the manual NOT represented above — look for overlooked maintenance procedures, specifications, advanced troubleshooting, safety warnings, or care instructions deeper in the document.`
  }

  return `You are a home appliance expert. Extract knowledge from this owner's manual PDF.${fillGapsNote}

CRITICAL: Output MUST be under 18000 tokens. Be concise — use 1-2 sentences per content field — but do NOT drop tasks or chunks to save space; completeness matters more than brevity. Skip pages not in English.
${accessoryNote}

Return a SINGLE JSON object (no markdown, no code fences):

{"chunks":[{"chunk_type":"care|how_to|troubleshooting|safety|specs","content_level":"critical|important|contextual|reference|everyday","title":"short title","content":"1-2 sentence summary","tags":["tag"],"scenarios":null,"source_pages":[1],"diagram_pages":[],"table_data":null,"applies_to":[]}],"tasks":[{"title":"task","description":"one sentence","care_type":"cleaning|maintenance|mixed","justification":"one sentence consequence of skipping","priority_tier":"essential|recommended|optional","risk_level":"safety|prevent_damage|performance|comfort","estimated_minutes":15,"schedule_type":"after_each_use|weekly|monthly|quarterly|semiannual|annual|seasonal|every_n_days|as_needed|setup","interval_days":null,"interval_days_min":null,"interval_days_max":null,"instructions_text":"brief steps","source_page":1,"tags":[],"diagram_pages":[],"symptom_tags":["canonical_tag"],"re_check_triggers":[{"trigger":"canonical_tag","description":"user-facing condition","severity":"safety|warning"}],"applies_to":[],"supplies":[{"name":"item","category":"filter|battery|cleaner|accessory|other","part_number":null}]}],"cleaning_guide":{"weekly":{"title":"Weekly","steps":["Step"],"supplies":["Item"]},"deep_clean":{"title":"Deep","steps":["Step"],"supplies":["Item"]}},"warranty":{"duration_months":12,"coverage":"summary","exclusions":["not covered item"],"registration_required":null,"contact":"url or phone"},"manufactured_year":null,"confidence":{"overall":0.85,"safety":0.9,"how_to":0.8,"care":0.8,"troubleshooting":0.8,"notes":"brief note"}}

CHUNK RULES (extract 15-35 chunks):
- chunk_type: care, how_to, troubleshooting, safety, or specs
- content_level REQUIRED for safety: critical (emergency/danger, 1-3 max), important (use warnings), contextual (activity-specific), reference (setup/compliance)
- content_level REQUIRED for how_to/care: everyday (daily operation, routine cleaning) or reference (specialty features, uncommon maintenance)
- No content_level for troubleshooting/specs
- scenarios: ONLY for critical safety — [{condition, steps[]}]. null otherwise.
- source_pages: PDF page numbers (required)
- diagram_pages: only actual diagrams, empty [] if none
- table_data: only for tables/troubleshooting — [{table_title, columns[], rows[][]}]. null otherwise.
- tags: short lowercase keywords. "optional-accessory" + name for accessories.
- content: 1-2 sentences MAX. Be concise.
- GROUPING: Combine sequential/related steps into ONE chunk. Assembly Step 1-7 → single "Assembly" chunk with numbered steps in content. Setup steps → single "Setup and First Use" chunk. Do NOT create separate chunks for each numbered step of the same procedure.
- troubleshooting: group by area, use table_data for Problem/Cause/Fix, keep content field brief
- Skip boilerplate, legal text, marketing. Min 2 how_to + 2 troubleshooting chunks.

TASK RULES (be thorough about genuine UPKEEP, but CURATE. A homeowner wants the handful of care jobs they'd actually want a REMINDER for — not a transcription of the manual. Emit a task for every distinct recurring MAINTENANCE or CLEANING procedure, plus every genuine setup step; do NOT emit the steps of simply operating the appliance (see NOT A TASK below). There is NO target count: extract every genuine upkeep task the manual describes, however many that is. Curation means excluding the things in NOT A TASK, never trimming real upkeep to reach a number.):
- ONLY tasks the manual explicitly describes. No guessing, and no padding with generic best-practices the manual does not state — completeness means capturing everything the manual actually covers, not inventing.
- ONE task per procedure. Never emit two tasks for the same job under different wording ("Clean the Door Seal" + "Clean Door Seal", "Clean the Dishwasher Exterior" + "Wipe Dishwasher Exterior", "Add Rinse Aid" + "Refill the Rinse Aid Dispenser"). If the manual describes the same procedure in two places, or at two cadences for different usage levels, emit it ONCE at the more frequent cadence and put the variation in instructions_text.
- CADENCE RANGES (interval_days_min / interval_days_max): PURELY ADDITIVE — choose schedule_type and interval_days exactly as you would otherwise, then ALSO record the range if the manual stated one. Never let the range change which schedule_type you pick. Recording a range does NOT mean the task is "every_n_days": a quarterly task whose manual says "every 3-4 months" is still "quarterly", with the range alongside it. When the manual gives a range ("every 6-12 months"), record it in days (180 and 365). When it gives a single figure, set BOTH to it. When it gives none, leave both null. Do NOT invent a range around a precisely stated number, and do NOT widen a narrow one — this range tells the owner how much slack they genuinely have, so a fabricated one is a false promise about their appliance.
- title: a SHORT, stable imperative — 3-6 words naming the action and the part ("Clean the Bucket", "Replace Carbon Filters"). NEVER append frequency, cadence, or conditions to the title ("Clean the Bucket After Each Use", "Replace Carbon Filters (Every 3-6 Months)") — cadence lives in schedule_type, conditions in instructions_text. Titles are used as stable identifiers across rescans; keep them minimal and consistent.
- SCAN THE WHOLE MANUAL for recurring care, not just a section titled "Maintenance": care steps are often embedded in operation, feature, "for best results", and troubleshooting sections. Emit a distinct task for each recurring procedure the manual mentions, including easy-to-miss ones: filters / screens / lint traps; sensors and probes (e.g. moisture sensors); seals / gaskets / door boots; interior surfaces, drum, or tub; exterior surfaces; drains, pumps, and hoses; vents / ducts / airflow paths; descaling or self-clean cycles; periodic inspections. Repetition alone does NOT make something a task: topping up a consumable to run the appliance (detergent, rinse aid, water, beans, pods) is repeated constantly and is still just operating it — see NOT A TASK.
- SETUP IS A SEPARATE BUDGET: one-time install / setup / commissioning steps get schedule_type "setup" (see SETUP TASKS below) and must NOT crowd out recurring tasks — extract ALL genuine setup steps AND ALL genuine recurring tasks. Every task is therefore EITHER recurring (cadence / habit / as_needed) OR setup — never a one-time step on a calendar cadence.
- care_type — decides WHERE the task appears, so get it right in BOTH directions. "maintenance" = preserves function or safety: anything involving a functional part (filters, screens, lint traps, coils, vents, ducts, drains, pumps, hoses, seals that stop leaks, spray arms, burners, igniters, sensors, anodes), plus descaling, flushing, self-clean cycles, and inspections. "cleaning" = appearance or hygiene only: wiping exteriors, control panels, door glass, stainless, shelves, drawers, bins, interior surfaces. "mixed" only when one procedure genuinely does both. Note the traps: "Clean the Filter System" and "Descale the Dishwasher" are MAINTENANCE despite the word clean — cleaning a functional part is functional work. "Clean the Dishwasher Exterior" is CLEANING despite sitting in a maintenance chapter.
- priority_tier: essential = a genuine SAFETY hazard (fire, shock, gas, CO, tip-over, scald) OR a lapse that voids warranty or causes failure within about a year. Essential is RARE — usually 0-2 per appliance, and it requires care_type maintenance/mixed with a real safety or damage consequence. recommended = extends lifespan or preserves function. optional = cosmetic or convenience. Routine wiping, polishing, exterior cleaning, deodorizing, and comfort steps are NEVER essential, however emphatically the manual words them. Self-check before you finish: if more than ~2 tasks are essential, or any essential task is care_type cleaning, you are inflating — demote the merely-good-to-do ones to recommended.
- instructions_text: concise, actionable how-to steps in PLAIN LANGUAGE (2-4 sentences max). Write what the user physically DOES, step by step — e.g. "Slide the racks out, wipe the runners with a dry cloth, then apply a thin film of food-safe lubricant." Do NOT restate the task title and do NOT use jargon: write the example above, never "condition-triggered maintenance to restore rack mobility."
- Keep WARNINGS OUT of instructions_text. "Do not / never / avoid" cautions must be their own separate sentences — never numbered among the steps, or they render as a step ("5. Do NOT use steel wool"). If a step has no real caution, don't invent one.
- description / justification: ONE plain-language sentence a homeowner understands. justification = what concretely happens if skipped ("Mineral scale builds up and the burner stops lighting reliably."), not abstract phrasing.
- source_page (required): the PDF page number you read this task's how-to from — the page where its steps/instructions actually appear, so we can link the user straight to it in the manual. Use the page the procedure is described on, not the table of contents.

NOT A TASK — DO NOT EMIT. These are how you USE or configure the appliance, not upkeep anyone needs reminding of. For each candidate ask: "would a homeowner want a recurring REMINDER for this, or is it just operating the thing?" If it is operation or a preference, DROP it — do not emit it at any tier or cadence. The information is still captured as a chunk, so nothing is lost.
- OPERATION / CONSUMABLE TOP-UPS — the normal act of using it: adding detergent, rinse aid, or dishwasher salt for a cycle; refilling or replacing the water in a tank or reservoir; loading beans, grounds, pods, or capsules; running a normal cycle; loading and unloading; adding ingredients; selecting a mode or cycle; "position the water tank arm"; "assemble the unit for use". (EXCEPTION — replacing a MAINTENANCE consumable on a cadence IS a task: filters, cartridges, screens, descaling agents.)
- ADJUSTING A PREFERENCE SETTING: dialling the rinse-aid dosage or water hardness up and down, changing temperature or unit preferences, tweaking a setting "based on results". Setting a dial is not maintenance.
- ONE-TIME CONFIG / PERSONALIZATION: Wi-Fi or app pairing, custom presets, programming a cup volume, factory reset, setting the clock, product registration.
- UNBOXING ARTIFACTS: removing shipping film, stickers, foam, or transit bolts. (Genuine install checks — leveling, grounding, clearances, anti-tip brackets — ARE setup tasks; peeling a sticker is not.)
- Pure information or "for best results" tips that describe no repeatable action.
When a step sits on the border between using and caring for the appliance, DOWNGRADE it rather than delete it: keep it as a task with priority_tier "optional" (and care_type "cleaning" if that is what it is). Deleting is only for the clear-cut cases listed above. A misfiled task is a small annoyance; a deleted one is invisible and the owner never learns the machine needed it.

NEVER DROP — these are the reason the product exists, and they outrank every instruction above. Emit them even if the list gets long, even if the manual buries them in an installation or troubleshooting chapter, and never weaken a manufacturer-stated interval to "as_needed":
- FILTERS AND SCREENS of any kind: air filters, water filters, lint traps and lint screens, drain-pump filters, mesh screens, filter-refresh cycles.
- DESCALING AND TUB/DRUM CARE: descale, delime, tub-clean or drum-clean cycles, self-clean cycles, removing mineral or limescale buildup.
- AIRFLOW AND DRAINAGE: vents, ducts, exhaust runs, blower wheels, condenser and evaporator coils, drains, drain pumps, condensate lines and traps, hoses (including INSPECTING a supply hose for wear — a burst hose floods a house).
- COMBUSTION AND ELECTRICAL SAFETY: flame sensors, igniters, burners, heat exchangers, gas-piping leak checks, CO and combustion-air verification, rollout and limit switches, grounding and anti-tip checks, input-rate verification.
- SEASONAL PREP: winterizing, freeze protection, cold-storage prep, pre-season startup checks.
- Anything the manual assigns an explicit schedule to (a stated "every N months", "annually", "each season") — that interval is the manufacturer's instruction; carry it through exactly.
- Any genuine install or commissioning step (leveling, clearances, venting connections, first-run verification). These are schedule_type "setup" and are budgeted SEPARATELY — never delete one to shorten the task list.
- SCHEDULED PROFESSIONAL SERVICE: an annual or seasonal professional tune-up, inspection, or certification the manual tells the owner to arrange. The owner still has to book it, so it is one of the most valuable reminders the product can give.
- SAFETY-DEVICE TESTS AND RESETS: testing or resetting rollout switches, limit switches, pressure switches, GFCI/AFCI protection, tip-over brackets, smoke/CO interlocks, and pressure-relief valves.

SCHEDULE FIDELITY — the cadence is part of the task, and silently weakening it is as harmful as dropping the task:
- NEVER demote a recurring task to schedule_type "setup". Setup means "once, at installation". If the manual says to inspect something periodically, it stays recurring, even when the same component is also checked during installation.
- When a procedure has BOTH a first-use/commissioning form and an ongoing form (e.g. an initial rinse cycle AND a periodic cleaning cycle), emit BOTH: one "setup" and one recurring. Do not let the setup variant absorb the recurring one.
- Only use "as_needed" when the manual itself gives no interval. If it states one ("every 3 months", "monthly", "each season"), carry that interval through — do not soften it to "as_needed" because the actual timing depends on conditions.

DOC TYPE — decide this FIRST, it changes how you extract:
Classify the manual as one of:
- "user_manual": written for a homeowner (operation, cleaning, routine care). Most consumer manuals.
- "install_service_manual": written for an installer/technician (gas piping, combustion, electrical,
  ductwork, start-up adjustments, manometer/static-pressure readings). Signals: the title says
  "Installation Manual"/"Service Manual"; the TOC is dominated by install/service sections; there is
  no homeowner "Maintenance"/"Care"/"Operation" section.
For an "install_service_manual": almost everything is one-time INSTALL (schedule_type "setup") or
PROFESSIONAL service — do NOT manufacture recurring homeowner tasks from gas/combustion/electrical/
start-up sections. Emit only the genuinely homeowner-recurring items the manual does mention
(e.g. replace the air filter), route fault/LED/diagnostic codes to troubleshooting chunks, and keep
the rest as setup or safety. It is correct for such a manual to yield FEW or ZERO recurring tasks.

AUDIENCE — the reader is a HOMEOWNER, not a service technician:
- For tasks that require a licensed professional or specialized tools (gas pressure / leak testing, combustion analysis, manometer or static-pressure readings, opening the gas valve or control board, line-voltage / 24V metering, refrigerant work), DO NOT write homeowner DIY steps. Write instructions_text as what to expect or what the technician checks, and put the safety reason in justification. It's fine to keep these as tasks (most homes book a pro for the annual service) — just don't instruct the homeowner to perform them.
- NEVER write a hazardous DIY instruction. "Loosen the gas union until you smell gas" and anything touching gas lines, the gas valve, combustion, or live electrical is professional-only — describe it, don't tell the homeowner to do it. Lean on the safety chunks for the warning.
- Pure ONE-TIME installation / commissioning / first-startup steps (initial gas-piping leak test, first system startup, setting blower taps at install) are schedule_type "setup", NOT recurring "as_needed". If it only happens once at install, it is setup.

CARE_TYPE CLASSIFICATION (CRITICAL — classify by CONSEQUENCE, not keywords):
For each task, ask: "If the user skips this for a year, what happens?"
- maintenance: function-preserving, warranty-relevant, or lifespan-affecting. Skipping damages the appliance, voids warranty, reduces efficiency, or causes failure. The word "clean" in the task title does NOT automatically make it cleaning — many cleaning actions (filter cleaning, descaling, run-cycles) are function-preserving maintenance.
- cleaning: cosmetic or hygienic-only. Skipping affects appearance, not function. Examples: wiping exterior surfaces, polishing, removing fingerprints, cleaning a door seal for appearance.
- mixed: genuinely both — a maintenance action that includes cleaning steps as the method (e.g. "Inspect and clean condenser coils"). Use sparingly; prefer maintenance when the function-preserving aspect dominates.
- WHEN AMBIGUOUS, choose maintenance. False positives (cleaning labeled as maintenance) are visible and recoverable; false negatives hide real obligations.

CARE_TYPE EXAMPLES:
- "Clean dishwasher filter monthly" → maintenance (skipping damages pump, dishes come out dirty)
- "Run washing machine clean cycle every 30 washes" → maintenance (manufacturer-specified; prevents biofilm, may void warranty)
- "Replace HVAC filter" → maintenance (efficiency loss, premature compressor wear)
- "Descale espresso machine" → maintenance (scale shortens heater lifespan)
- "Test smoke detector battery" → maintenance (safety)
- "Wipe exterior with damp cloth" → cleaning (cosmetic only)
- "Polish stainless steel surfaces" → cleaning (appearance only)
- "Clean door seal for appearance" → cleaning (no functional consequence)
- "Inspect and clean condenser coils" → mixed (inspection is maintenance, cleaning is the method)

JUSTIFICATION (REQUIRED for every task): One short sentence stating the consequence of skipping, drawn from the manual when stated. This shows up as user-facing "Why this matters" copy and lets the user trust the classification. Examples:
- "Prevents pump damage and poor wash performance from food debris buildup."
- "Manufacturer-required every 30 cycles to prevent biofilm; skipping may void warranty."
- "Maintains heating efficiency; scale buildup shortens element lifespan."
- "Cosmetic only — keeps stainless surface free of fingerprints and smudges."

SETUP TASKS (schedule_type: "setup") — RECOGNIZE AT EXTRACTION:
A small but important class of tasks: install-time checks that happen ONCE when the appliance is set up, then re-trigger only on disturbance (item moved, reinstalled) or symptom (vibrating, leaking, etc). They are NOT recurring tasks and DO NOT belong on a calendar cadence. They route to the Setup Checklist surface, not the recurring task feed.

Recognize setup tasks when the manual describes:
- Leveling / orientation: "Level the washer," "Verify the unit sits flat," "Verify dryer is level"
- Position / connection: "Check drain hose position," "Verify gas connection," "Inspect water supply line,"
  "Connect the inlet hose," "Connect gas/electrical supply," "Inspect power cord and connections"
- Grounding / electrical: "Verify proper grounding," "Confirm dedicated circuit"
- First-use ventilation / clearance: "Inspect vents for blockage during install," "Confirm 3-inch clearance"
- Calibration / first-run / install verification: "Calibrate ice maker before first use," "Run initial cycle empty,"
  "Run the installation test," "Flow Sense / duct check at install," "Reverse the door"
A reliable test: if the step is something you do ONCE while installing/setting up the appliance — and
would only repeat if you moved or reinstalled it — it is "setup", even if the manual phrases it as
"inspect" or "check". An install-time inspection is still setup, NOT recurring maintenance.

For each setup task, also populate re_check_triggers — the conditions under which the user should re-verify the setup. Each trigger references a canonical symptom tag (see SYMPTOM TAGS below), describes the condition in user-facing language, and has a severity ("safety" for immediate danger, "warning" otherwise).

SETUP TASK EXAMPLES (showing schedule_type + re_check_triggers):
- "Level the washer" → schedule_type: "setup"
  re_check_triggers: [{trigger: "vibration", description: "Washer vibrates excessively or walks during spin cycle", severity: "warning"}]
- "Verify proper grounding" → schedule_type: "setup"
  re_check_triggers: [{trigger: "electrical", description: "Burning smell, sparks, or shock when touching the unit", severity: "safety"}]
- "Check drain hose position and security" → schedule_type: "setup"
  re_check_triggers: [{trigger: "leaking", description: "You moved the unit, or you notice water around the base", severity: "warning"}]
- "Inspect vents for blockage" → schedule_type: "setup"
  re_check_triggers: [{trigger: "overheating", description: "Unit runs hot or food cooks unevenly", severity: "warning"}]

DEFAULT: do NOT classify a task as setup unless it clearly matches the patterns above. Most tasks remain recurring (calendar/habit/as_needed).

SYMPTOM TAGS (REQUIRED on every task — empty array if none apply):
For each task, populate symptom_tags with 0 to 3 canonical tags from this fixed list:
  vibration, drainage, electrical, noise, wont_start, overheating, leaking, odor,
  error_code, wont_clean, performance_drop, physical_damage

Tags are the integration key that connects setup tasks ↔ maintenance tasks ↔ knowledge chunks for the troubleshooting flow. A task gets a symptom tag when SKIPPING the task could plausibly cause that symptom, or when the task is meant to FIX/PREVENT that symptom.

SYMPTOM TAG EXAMPLES:
- "Replace HVAC filter" → ["overheating", "performance_drop"] (clogged filter → reduced airflow → overheating + efficiency drop)
- "Clean dishwasher filter" → ["drainage", "wont_clean", "odor"]
- "Run washing machine clean cycle" → ["odor", "performance_drop"]
- "Test smoke detector battery" → [] (safety task; no symptom tag fits)
- "Wipe exterior" → [] (cosmetic; no symptom)
- "Level the washer" → ["vibration", "noise"]
- "Inspect vents for blockage" → ["overheating", "performance_drop"]

DEFAULT: empty array. Only tag a symptom when there's a clear cause-effect link.

APPLIES_TO (tasks AND chunks) — use SPARINGLY; the default is [] and MOST tasks/chunks are []:
This tags a step that applies to ONLY ONE of several mutually-exclusive POWER / FUEL / HARDWARE configurations of the same product — e.g. ["gas"] vs ["electric"] vs ["steam"], or ["propane"] vs ["natural_gas"]. Tag ONLY when BOTH are true: (1) the manual actually covers more than one such configuration, AND (2) the manual explicitly scopes the step to one of them ("Gas models only:", "On steam models:"). Use the single distinguishing word as a lowercase token.
NEVER use applies_to for: finishes or colors (stainless, white), materials, sizes/capacities, model numbers, optional accessories, install location (indoor/outdoor), or ambient/weather conditions — those are NOT configurations; leave applies_to []. When in any doubt, leave it [] — an untagged step shows for everyone, which is the safe default.

SUPPLIES (per task): ONLY when the manual explicitly names a part/product the task needs (e.g. a replacement filter and its part number, a specific cleaner). name = what to buy; category = filter|battery|cleaner|accessory|other; part_number = OEM number if cited, else null. Default []. NEVER invent supplies or guess part numbers — if the manual doesn't name a specific item, leave it empty.

CLEANING GUIDE: weekly (3-6 steps), deep_clean (4-8 steps). null if no cleaning section.
WARRANTY: duration_months (years→months), coverage (1-2 sentence prose summary of what's covered). exclusions: array of short phrases for what's explicitly NOT covered (e.g. "cosmetic wear", "commercial use", "consumer-replaceable parts") — [] if none cited, never invent. registration_required: true/false/null. contact: warranty-service phone, email, or URL if cited, else null. Whole object null if no warranty section found.
MANUFACTURED_YEAR: integer year 1900-2100 if the manual clearly states a model-year, copyright / revision / print date you're confident is the manufacture year, or an unambiguous serial-number date code you can decode. Use null when unsure — a wrong year is worse than a missing one. Never guess from "this is an older model" language.
CONFIDENCE: 0-1 per section. notes: brief explanation of difficulties.${correctionNote}`
}

/**
 * Sampling params for the extraction call, per model. Newer Anthropic models
 * (Opus 4.8, the Claude 5 family) REJECT the `temperature` param with HTTP 400
 * ("deprecated for this model") — sending it unconditionally silently broke
 * every gas/safety-critical parse, which pickParseModel escalates to Opus.
 * Older models keep temperature 0.1: the model eval found the unset default
 * (1.0) was the main driver of run-to-run extraction inconsistency.
 * Found by the eval harness on its first full corpus run (2026-07-01).
 */
export function samplingParamsFor(model: string): { temperature?: number } {
  return /opus-4-8|-5\b|fable/.test(model) ? {} : { temperature: 0.1 }
}

/**
 * Extracts the JSON object from a Claude text response — strips markdown code
 * fences and grabs the outermost {...} block. Shared by parse-manual and the
 * eval harness so response handling can't drift.
 */
export function extractJsonObject(raw: string): string {
  const stripped = raw.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim()
  const m = stripped.match(/\{[\s\S]*\}/)
  return m ? m[0] : "{}"
}

/**
 * Forced tool for the extraction call. The API delivers tool input as parsed
 * JSON (content block `input`), which eliminates the free-text-JSON failure
 * class entirely — the eval harness caught Opus intermittently emitting
 * malformed JSON (1 of 2 runs) once temperature became un-pinnable on it.
 *
 * The schema is deliberately PERMISSIVE at depth: top-level shape only, deep
 * validation stays in the normalizers. A tight schema risks the model dropping
 * tasks it can't fit into constraints — a behavior change we don't want; the
 * bug being fixed is syntactic validity, not semantics. preview-manual uses
 * the same tool and simply never receives cleaning_guide/warranty keys because
 * its prompt doesn't ask for them.
 */
export const EXTRACTION_TOOL = {
  name: "record_extraction",
  description:
    "Record the complete structured extraction from the manual. Every chunk and task goes in this single call.",
  input_schema: {
    type: "object",
    properties: {
      chunks: { type: "array", items: { type: "object" } },
      tasks: { type: "array", items: { type: "object" } },
      cleaning_guide: { type: ["object", "null"] },
      warranty: { type: ["object", "null"] },
      manufactured_year: { type: ["integer", "null"] },
      confidence: { type: ["object", "null"] },
    },
    required: ["chunks", "tasks"],
  },
} as const

type ClaudeContentBlock = { type: string; name?: string; input?: unknown; text?: string }

/**
 * Pulls the extraction result from a Claude response: prefers the forced
 * tool_use block's already-parsed input; falls back to text-block JSON for
 * any model quirk. Shared by parse-manual, preview-manual, and the harness.
 */
export function extractParsedResult(claudeData: { content?: ClaudeContentBlock[] }): unknown {
  const blocks = claudeData?.content ?? []
  const tool = blocks.find((b) => b.type === "tool_use" && b.name === EXTRACTION_TOOL.name)
  if (tool && tool.input && typeof tool.input === "object") return tool.input
  const lastText = [...blocks].reverse().find((b) => b.type === "text")
  return JSON.parse(extractJsonObject(lastText?.text ?? "{}"))
}
