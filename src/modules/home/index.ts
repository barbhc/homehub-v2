export {
  createHome,
  getHomes,
  getPrimaryHome,
  getHome,
  getRooms,
  createRoom,
  renameRoom,
  deleteRoom,
  type CreateHomeInput,
  type CreateHomeResult,
  type CreateRoomInput,
  type ServiceResult,
} from "./services/homeService"

export {
  createInvite,
  getActiveInvites,
  revokeInvite,
  getInviteByToken,
  acceptInvite,
  getHomeMembers,
  removeMember,
  buildInviteUrl,
  type HomeInvite,
  type HomeMember,
  type InviteDetails,
} from "./services/inviteService"

export { HomeProvider, useCurrentHome, useCurrentPropertyCompat } from "./components/HomeProvider"
export { HomeGate } from "./components/HomeGate"
export { HomeOnboarding } from "./components/HomeOnboarding"
export { HomeProfileOnboarding } from "./components/HomeProfileOnboarding"

export {
  getHomeProfile,
  upsertHomeProfile,
  TOP_CONCERN_KEYS,
  type HomeProfile,
  type HomeProfileUpsert,
  type HomeType,
  type Ownership,
  type OwnershipDuration,
  type PreferredMode,
  type Climate,
  type TopConcernKey,
} from "./services/homeProfileService"

export { useHomeProfile } from "./hooks/useHomeProfile"
