/**
 * The "Your home" questionnaire's categories (HomeSetup), and how each reads on
 * the list. Its own module so HomeSetup.tsx exports only its page component
 * (react-refresh).
 */
import type { CareFacts } from "../../shared/care/library"

export type FactKey = keyof CareFacts

/** One category of the questionnaire. `building` is the fact that hands the whole category to the building. */
export type Category = {
  key: string
  label: string
  blurb: string
  building?: FactKey
  questions: { fact: FactKey; text: string }[]
}

export const CATEGORIES: Category[] = [
  {
    key: "safety", label: "Safety", blurb: "Alarms and the extinguisher",
    questions: [
      { fact: "has_smoke_alarms", text: "Smoke or carbon-monoxide alarms in the home?" },
      { fact: "has_extinguisher", text: "A fire extinguisher you keep?" },
    ],
  },
  {
    key: "water", label: "Water heater", blurb: "Tank or tankless",
    questions: [{ fact: "has_water_heater", text: "A water heater that is yours to look after?" }],
  },
  {
    key: "hvac", label: "Heating & cooling", blurb: "Furnace, boiler, central air",
    questions: [{ fact: "has_hvac_service", text: "A furnace or central air system you have serviced?" }],
  },
  {
    key: "pests", label: "Pests", blurb: "Termites, birds, rodents", building: "building_handles_pests",
    questions: [
      { fact: "termite_risk", text: "Termites a known risk where you live?" },
      { fact: "birds_roosting", text: "Birds roosting on ledges, balconies or the roof?" },
      { fact: "rodents", text: "Rodents seen or suspected?" },
    ],
  },
  {
    key: "exterior", label: "Roof, gutters & exterior", blurb: "What the weather reaches", building: "building_handles_exterior",
    questions: [{ fact: "has_gutters", text: "Gutters and downspouts on the home?" }],
  },
]

/** How a category reads on the list: unanswered, N answered, or handed to the building. */
export function categoryStatus(c: Category, facts: CareFacts): string {
  if (c.building && facts[c.building]) return "The building handles it"
  const answered = c.questions.filter((q) => facts[q.fact] !== undefined).length
  if (answered === 0) return "Not answered yet"
  return answered === c.questions.length ? "Answered" : `${answered} of ${c.questions.length} answered`
}
