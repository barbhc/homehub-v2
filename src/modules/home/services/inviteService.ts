import { supabase } from "@/integrations/shim/client"
import type { ServiceResult } from "./homeService"

export type HomeInvite = {
  invite_id: string
  home_id: string
  token: string
  role: string
  created_by: string
  accepted_by: string | null
  accepted_at: string | null
  expires_at: string
  created_at: string
}

export type HomeMember = {
  home_id: string
  user_id: string
  role: string
  is_primary: boolean
  profile?: { full_name: string | null; avatar_url: string | null }
}

export type InviteDetails = {
  invite_id: string
  home_id: string
  token: string
  role: string
  expires_at: string
  accepted_by: string | null
  home: { name: string } | null
  creator: { full_name: string | null } | null
}

/**
 * Creates an invite link for the given home.
 */
export async function createInvite(
  homeId: string,
  userId: string,
  role: "admin" | "member" | "guest" = "admin"
): Promise<ServiceResult<HomeInvite>> {
  const { data, error } = await supabase
    .from("home_invite")
    .insert({ home_id: homeId, created_by: userId, role })
    .select()
    .single()

  if (error) return { data: null, error: { message: error.message } }
  return { data: data as HomeInvite, error: null }
}

/**
 * Lists active (non-expired, non-accepted) invites for a home.
 */
export async function getActiveInvites(homeId: string): Promise<ServiceResult<HomeInvite[]>> {
  const { data, error } = await supabase
    .from("home_invite")
    .select("*")
    .eq("home_id", homeId)
    .is("accepted_by", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })

  if (error) return { data: null, error: { message: error.message } }
  return { data: (data ?? []) as HomeInvite[], error: null }
}

/**
 * Revokes (deletes) an invite.
 */
export async function revokeInvite(inviteId: string): Promise<ServiceResult<true>> {
  const { error } = await supabase
    .from("home_invite")
    .delete()
    .eq("invite_id", inviteId)

  if (error) return { data: null, error: { message: error.message } }
  return { data: true, error: null }
}

/**
 * Fetches invite details by token (for the accept page).
 */
export async function getInviteByToken(token: string): Promise<ServiceResult<InviteDetails>> {
  const { data, error } = await supabase
    .from("home_invite")
    .select("invite_id, home_id, token, role, expires_at, accepted_by, created_at")
    .eq("token", token)
    .single()

  if (error) return { data: null, error: { message: error.message } }

  const invite = data as HomeInvite

  // Fetch home name and creator name separately
  const [homeRes, creatorRes] = await Promise.all([
    supabase.from("home").select("name").eq("home_id", invite.home_id).single(),
    supabase.from("profiles").select("full_name").eq("id", invite.created_by).single(),
  ])

  return {
    data: {
      ...invite,
      home: homeRes.data as { name: string } | null,
      creator: creatorRes.data as { full_name: string | null } | null,
    } as InviteDetails,
    error: null,
  }
}

/**
 * Accepts an invite using the server-side RPC function.
 */
export async function acceptInvite(token: string): Promise<
  { success: true; home_id: string; home_name: string; role: string } |
  { success: false; error: string }
> {
  const { data, error } = await supabase.rpc("accept_home_invite", {
    invite_token: token,
  })

  if (error) return { success: false, error: error.message }

  const result = data as { success?: boolean; error?: string; home_id?: string; home_name?: string; role?: string }
  if (result.error) return { success: false, error: result.error }

  return {
    success: true,
    home_id: result.home_id!,
    home_name: result.home_name!,
    role: result.role!,
  }
}

/**
 * Fetches members of a home with their profile info.
 */
export async function getHomeMembers(homeId: string): Promise<ServiceResult<HomeMember[]>> {
  const { data, error } = await supabase
    .from("home_members")
    .select("home_id, user_id, role, is_primary")
    .eq("home_id", homeId)

  if (error) return { data: null, error: { message: error.message } }

  const members = (data ?? []) as HomeMember[]

  // Fetch profiles for all members
  const userIds = members.map((m) => m.user_id)
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url")
      .in("id", userIds)

    const profileMap = new Map(
      (profiles ?? []).map((p: { id: string; full_name: string | null; avatar_url: string | null }) => [
        p.id,
        { full_name: p.full_name, avatar_url: p.avatar_url },
      ])
    )

    for (const member of members) {
      member.profile = profileMap.get(member.user_id)
    }
  }

  return { data: members, error: null }
}

/**
 * Removes a member from a home (only owner can do this).
 */
export async function removeMember(homeId: string, userId: string): Promise<ServiceResult<true>> {
  // Owner-driven removal goes through an RPC (SECURITY DEFINER) because the
  // home_members RLS policy is self-only DELETE. The RPC enforces:
  //   - caller is the owner of the home, OR caller is removing themselves
  //   - cannot remove the last owner
  const { error } = await supabase.rpc("remove_home_member", {
    p_home_id: homeId,
    p_user_id: userId,
  })

  if (error) return { data: null, error: { message: error.message } }
  return { data: true, error: null }
}

/**
 * Builds a shareable invite URL from a token.
 */
export function buildInviteUrl(token: string): string {
  const base = window.location.origin
  return `${base}/invite/${token}`
}
