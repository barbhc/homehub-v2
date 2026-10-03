/**
 * Inventory module — add-item flows over the Firebase-native itemService.
 * Public API: useCreateItem. (useItems / useItem had no callers and were
 * removed.)
 */

export { useCreateItem } from "./hooks"
export { APPLIANCE_TYPES } from "./constants/applianceTypes"
export {
  searchProductImages,
  saveProductPhotoFromUrl,
  type ProductImageCandidate,
} from "./services/storageService"
