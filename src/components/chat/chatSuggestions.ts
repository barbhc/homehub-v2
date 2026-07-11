const ROOM_SUGGESTIONS: Record<string, string[]> = {
  kitchen: [
    "How often should I clean the range hood filter?",
    "How do I deep clean my oven?",
    "Why is my refrigerator making a clicking noise?",
    "How do I run a dishwasher self-clean cycle?",
  ],
  laundry: [
    "How do I get rid of mold on the washer door gasket?",
    "Why does my dryer take two cycles to dry clothes?",
    "How often should I clean the dryer vent?",
    "What does a flashing error code mean on my washer?",
  ],
  bathroom: [
    "How often should I flush my water heater?",
    "How do I check my water heater anode rod?",
    "Why is my shower pressure dropping?",
    "How do I fix a slow-draining sink?",
  ],
  garage: [
    "How do I lubricate my garage door?",
    "Why does my garage door reverse before closing?",
    "How often should I test the garage door safety sensors?",
    "How do I reset my garage door opener?",
  ],
  bedroom: [
    "How do I clean my ceiling fan blades?",
    "Why is my air vent making a rattling noise?",
    "How often should I vacuum my mattress?",
    "How do I clean window blinds effectively?",
  ],
}

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

const DEFAULT_SUGGESTIONS = [
  "How do I clean my dishwasher filter?",
  "My washer smells musty — why?",
  "When should I replace my HVAC filter?",
  "How do I defrost my refrigerator?",
]

export function getSuggestions(
  selectedRoomIds: string[],
  selectedItemId: string | null,
  rooms: Array<{ room_id: string; name: string }>,
  items: Array<{ item_unit_id: string; display_name: string }>
): string[] {
  // Item takes priority
  if (selectedItemId) {
    const item = items.find((i) => i.item_unit_id === selectedItemId)
    if (item) {
      const key = Object.keys(ITEM_SUGGESTIONS).find((k) =>
        item.display_name.toLowerCase().includes(k)
      )
      if (key) return ITEM_SUGGESTIONS[key]
    }
  }
  // Single room selected
  if (selectedRoomIds.length === 1) {
    const room = rooms.find((r) => r.room_id === selectedRoomIds[0])
    if (room) {
      const key = Object.keys(ROOM_SUGGESTIONS).find((k) =>
        room.name.toLowerCase().includes(k)
      )
      if (key) return ROOM_SUGGESTIONS[key]
    }
  }
  return DEFAULT_SUGGESTIONS
}
