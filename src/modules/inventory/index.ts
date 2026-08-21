/**
 * Inventory module — add-item flows over the Firebase-native itemService.
 * Public API: useItems, useItem, useCreateItem.
 */

export { useItems, useItem, useCreateItem } from "./hooks"
export { APPLIANCE_TYPES } from "./constants/applianceTypes"
export {
  searchProductImages,
  saveProductPhotoFromUrl,
  type ProductImageCandidate,
} from "./services/storageService"
