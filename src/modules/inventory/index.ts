/**
 * Inventory module — items, categories.
 * Public API: useItems, useItem, useCategories; AddItemForm.
 */

export { useItems, useItem, useCategories, useCreateItem } from "./hooks"
export { AddItemForm, type AddItemFormValues } from "./components/AddItemForm"
export { APPLIANCE_TYPES } from "./constants/applianceTypes"
export { updateItem } from "./services/inventoryService"
export type { CreateItemInput, UpdateItemInput } from "./services/inventoryService"
export type {} from "./types"
export {
  searchProductImages,
  saveProductPhotoFromUrl,
  type ProductImageCandidate,
} from "./services/storageService"
