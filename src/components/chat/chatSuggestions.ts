import type { AskStarter } from "../../../shared/care/dayOne"

const ITEM_SUGGESTIONS: Record<string, string[]> = {
  dishwasher: [
    "How do I clean the dishwasher filter?",
    "Why are my dishes coming out cloudy?",
    "How do I run a clean cycle?",
    "What is the best rinse aid to use?",
  ],
  refrigerator: [
    "How do I defrost my refrigerator?",
    "Why is my fridge making noise?",
    "How often should I clean the coils?",
    "How do I replace the water filter?",
  ],
  washer: [
    "How do I remove the musty smell from my washer?",
    "How do I run a Tub Clean cycle?",
    "Why is my washer vibrating excessively?",
    "How do I clean the drain pump filter?",
  ],
  dryer: [
    "How do I clean the dryer vent?",
    "Why is my dryer not heating?",
    "How often should I have the duct inspected?",
    "What causes clothes to come out damp?",
  ],
  hvac: [
    "How often should I replace the air filter?",
    "Why is my HVAC making a rattling sound?",
    "How do I improve airflow in my home?",
    "How do I clean my AC coils?",
  ],
  "range hood": [
    "How do I clean aluminum mesh filters?",
    "How often should I replace charcoal filters?",
    "Why is my range hood not venting properly?",
    "How do I degrease the range hood exterior?",
  ],
  "water heater": [
    "How often should I flush my water heater?",
    "How do I check the anode rod?",
    "What temperature should my water heater be set to?",
    "How do I relight the pilot light?",
  ],
  "garage door": [
    "How do I lubricate my garage door springs?",
    "Why does my garage door reverse before closing?",
    "How do I test the safety sensors?",
    "How do I reset the garage door opener?",
  ],
}

/**
 * The Ask tab's suggestion chips. Scoped to one of the home's own items, they
 * are that item's questions; otherwise they are the home's starters
 * (`askStartersForHome`, the same ones Home shows under Ask). The fixed
 * dishwasher / washer / fridge list and the per-room lists are gone (owner,
 * 2026-11-21): they asked about appliances a home might not have.
 */
export function getSuggestions(
  selectedItemId: string | null,
  items: Array<{ item_unit_id: string; display_name: string }>,
  homeStarters: AskStarter[],
): AskStarter[] {
  if (selectedItemId) {
    const item = items.find((i) => i.item_unit_id === selectedItemId)
    if (item) {
      const key = Object.keys(ITEM_SUGGESTIONS).find((k) =>
        item.display_name.toLowerCase().includes(k)
      )
      if (key) return ITEM_SUGGESTIONS[key].map((q) => ({ label: q, question: q }))
    }
  }
  return homeStarters
}
