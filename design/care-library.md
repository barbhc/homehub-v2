# The care library

_Decided 2026-09-06 with the owner, after re-running her own reminder request
("filters, smoke alarms, dryer vent, descale the Nespresso, termites and
pigeons, FoodCycler charcoal…") through the app and finding that most of it
could never come from a manual._

## Why manuals are not enough

- Manuals state a cadence for some care and only an **indicator** for other
  care (the Nespresso says "descale when the light comes on" — no interval).
- Some items have **no manual** at all (the Levoit purifier) and the parser
  under-generalises the ones that do (both purifiers' filters were skipped).
- Whole-home care — pests, gutters, smoke alarms, the water heater — is not
  anyone's manual. It is the house's.

So Homehub keeps a small **library of typical care**: what a kind of item, or
a kind of home, generally needs. The library never edits the manual's work;
it fills the gaps and says where it came from.

## Vocabulary

| Word | Meaning |
|---|---|
| **Kind** | What an item is, from its category/type/name (`kindOf`). One kind per item, or none. Small appliances with no essential care have no kind on purpose. |
| **Archetype** | A canonical piece of care (`hepa_filter`, `descale`, `alarm_test`…). A parsed task is matched to one by title rules, then by title similarity. |
| **Entry** | One library row: kind + archetype + cadence + why + how + source. |
| **Fact** | A yes/no about the home (`has_gutters`, `termite_risk`, `building_handles_pests`…) gathered by the setup questions. Home-level entries are gated on facts; `building_handles_*` suppresses whole categories. |
| **Suggestion** | An entry the item or home lacks, minus dismissed ones. |
| **Backstop** | For an indicator entry (descale) when the manual's task exists but is `as_needed`: offer a time-based cadence *behind* the indicator, never instead of it. |

## The three surfaces

1. **Item page → "Suggested" band** (after Cleaning). One row per suggestion:
   detail full width, actions beneath, a source line for the kind. Add creates
   a task with `externalKey: "library:<key>"`; Not this one writes the key to
   the item's `dismissedCare`. Library-added rows carry a provenance line with
   a one-tap "Not this one" (archives the task).
2. **Tasks page → standing "Suggested" group**, always last, never counted in
   the groups above it. Every existing task stays exactly where it was.
3. **Settings → Your home (`/home-setup`)**: categories from the InterNACHI
   SOP systems plus pests / yard / exterior, each with "the building handles
   it"; drill-in questions write `homes.careFacts`; results offer Add / Add
   all; a free-text "Add something the library missed" creates a plain task.

## Rules that hold everywhere

- **The manual wins.** An entry whose archetype a parsed task already matches
  is never offered.
- **Suggest, never assume.** Nothing is created or scheduled until she taps
  Add. Dismissals are per item (or per home) and reversible by clearing them.
- **Provenance is visible.** A library task never reads as if it came from the
  manual.
- **Indicator care is never forced onto a clock.** The backstop is an offer,
  and only when the manual's own task is `as_needed`.
- Every row action that fails keeps the row and shows the error in place.

## Sources

InterNACHI Standards of Practice (system list), NFPA smoke-alarm guidance,
manufacturer guidance for filter cadences, and the owner's own confirmations.
Each entry's `source` field names its origin and is shown on the row.
