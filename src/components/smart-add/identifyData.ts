import type { IdentifyData } from "./IdentifyStep"

/** An empty identify step — where every add starts, and what "Start something
 *  else" resets to. Its own module so IdentifyStep.tsx exports only its
 *  component (react-refresh). */
export const DEFAULT_IDENTIFY_DATA: IdentifyData = {
  brand: "",
  model: "",
  name: "",
  serialNumber: "",
  itemCategory: null,
  subType: null,
  categoryFields: {},
  confidence: 0,
  locationId: null,
  purchaseDate: null,
  purchasePrice: null,
}
