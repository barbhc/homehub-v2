import { supabase } from "@/integrations/shim/client"
import type { Home, Room } from "@/integrations/types"

export type ServiceResult<T> =
  | { data: T; error: null }
  | { data: null; error: { message: string } }

const DEFAULT_ROOMS = [
  "Kitchen",
  "Bathroom",
  "Laundry Room",
  "Garage",
  "Living Room",
  "Bedroom",
  "Basement",
  "Outdoor/Yard",
  "Utility Room",
]

export type CreateHomeInput = {
  name: string
  timezone?: string
  userId: string
}

export type CreateHomeResult =
  | { data: { homeId: string }; error: null }
  | { data: null; error: { message: string } }

/**
 * Creates a home, adds the user as owner, and seeds default rooms.
 */
export async function createHome(input: CreateHomeInput): Promise<CreateHomeResult> {
  const { data: home, error: homeErr } = await supabase
    .from("home")
    .insert({
      name: input.name,
      timezone: input.timezone ?? "America/Los_Angeles",
    })
    .select("home_id")
    .single()

  if (homeErr) return { data: null, error: { message: homeErr.message } }
  const homeId = (home as { home_id: string }).home_id

  const rollback = async () => {
    await supabase.from("home").delete().eq("home_id", homeId)
  }

  const { error: memberErr } = await supabase.from("home_members").insert({
    home_id: homeId,
    user_id: input.userId,
    role: "owner",
    is_primary: true,
  })

  if (memberErr) {
    await rollback()
    return { data: null, error: { message: memberErr.message } }
  }

  const roomRows = DEFAULT_ROOMS.map((name) => ({ home_id: homeId, name }))
  const { error: roomErr } = await supabase.from("room").insert(roomRows)
  if (roomErr) {
    await rollback()
    return { data: null, error: { message: roomErr.message } }
  }

  return { data: { homeId }, error: null }
}

/**
 * Fetches homes the user belongs to.
 */
export async function getHomes(): Promise<ServiceResult<Home[]>> {
  const { error, data } = await supabase
    .from("home")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })

  if (error) return { data: null, error: { message: error.message } }
  return { data: (data ?? []) as Home[], error: null }
}

/**
 * Fetches the user's primary or first home.
 */
export async function getPrimaryHome(): Promise<ServiceResult<Home | null>> {
  const { data: user } = await supabase.auth.getUser()
  const userId = user.user?.id ?? ""
  if (!userId) {
    console.debug("[getPrimaryHome] No authenticated user")
    return { data: null, error: null }
  }

  const { data: member, error: memberErr } = await supabase
    .from("home_members")
    .select("home_id")
    .eq("user_id", userId)
    .eq("is_primary", true)
    .maybeSingle()

  if (memberErr) {
    console.debug("[getPrimaryHome] home_members (primary) error:", memberErr.message)
  }

  if (!member) {
    const { data: first, error: firstErr } = await supabase
      .from("home_members")
      .select("home_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle()

    if (firstErr) {
      console.debug("[getPrimaryHome] home_members (any) error:", firstErr.message)
    }
    if (!first) {
      console.debug("[getPrimaryHome] No home_members row for user", userId)
      return { data: null, error: null }
    }
    const homeId = (first as { home_id: string }).home_id
    const { data: h, error } = await supabase
      .from("home")
      .select("*")
      .eq("home_id", homeId)
      .is("deleted_at", null)
      .single()
    if (error) {
      console.debug("[getPrimaryHome] home fetch error for", homeId, error.message)
      return { data: null, error: { message: error.message } }
    }
    console.debug("[getPrimaryHome] Found home (fallback):", homeId, (h as Home)?.name)
    return { data: h as Home, error: null }
  }

  const homeId = (member as { home_id: string }).home_id
  const { data: h, error } = await supabase
    .from("home")
    .select("*")
    .eq("home_id", homeId)
    .is("deleted_at", null)
    .single()

  if (error) {
    console.debug("[getPrimaryHome] home fetch error for primary", homeId, error.message)
    return { data: null, error: { message: error.message } }
  }
  console.debug("[getPrimaryHome] Found primary home:", homeId, (h as Home)?.name)
  return { data: h as Home, error: null }
}

/**
 * Fetches a single home by id.
 */
export async function getHome(homeId: string): Promise<ServiceResult<Home | null>> {
  const { error, data } = await supabase
    .from("home")
    .select("*")
    .eq("home_id", homeId)
    .is("deleted_at", null)
    .single()

  if (error) {
    if (error.code === "PGRST116") return { data: null, error: null }
    return { data: null, error: { message: error.message } }
  }
  return { data: data as Home, error: null }
}

/**
 * Fetches rooms for a home.
 */
export async function getRooms(homeId: string): Promise<ServiceResult<Room[]>> {
  const { error, data } = await supabase
    .from("room")
    .select("*")
    .eq("home_id", homeId)
    .is("deleted_at", null)
    .order("name")

  if (error) return { data: null, error: { message: error.message } }
  return { data: (data ?? []) as Room[], error: null }
}

export type CreateRoomInput = {
  home_id: string
  name: string
}

/**
 * Creates a room.
 */
export async function createRoom(input: CreateRoomInput): Promise<ServiceResult<Room>> {
  const { error, data } = await supabase
    .from("room")
    .insert(input)
    .select()
    .single()

  if (error) return { data: null, error: { message: error.message } }
  return { data: data as Room, error: null }
}

/**
 * Renames a room.
 */
export async function renameRoom(roomId: string, name: string): Promise<ServiceResult<Room>> {
  const { error, data } = await supabase
    .from("room")
    .update({ name })
    .eq("room_id", roomId)
    .select()
    .single()

  if (error) return { data: null, error: { message: error.message } }
  return { data: data as Room, error: null }
}

/**
 * Soft-deletes a room and nullifies room_id on related records.
 */
export async function deleteRoom(roomId: string): Promise<ServiceResult<true>> {
  // Soft-delete the room
  const { error: roomErr } = await supabase
    .from("room")
    .update({ deleted_at: new Date().toISOString() })
    .eq("room_id", roomId)

  if (roomErr) return { data: null, error: { message: roomErr.message } }

  // Nullify room_id on related tables
  const [itemRes, taskRes, sessionRes, noteRes] = await Promise.all([
    supabase.from("item_unit").update({ room_id: null }).eq("room_id", roomId),
    supabase.from("task_template").update({ room_id: null }).eq("room_id", roomId),
    supabase.from("cleaning_session").update({ room_id: null }).eq("room_id", roomId),
    supabase.from("care_note").update({ room_id: null }).eq("room_id", roomId),
  ])

  const firstError = [itemRes, taskRes, sessionRes, noteRes].find((r) => r.error)
  if (firstError?.error) {
    console.warn("[deleteRoom] Failed to nullify room_id on related records:", firstError.error.message)
  }

  return { data: true, error: null }
}
