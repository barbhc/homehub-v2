import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  writeBatch,
  Timestamp,
  type DocumentData,
} from "firebase/firestore"
import { db, callable } from "@/integrations/firebase"
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

function invIso(v: unknown): string {
  if (v instanceof Timestamp) return v.toDate().toISOString()
  return typeof v === "string" ? v : ""
}
function toInvite(homeId: string, id: string, d: DocumentData): HomeInvite {
  return {
    invite_id: id,
    home_id: homeId,
    token: d.token ?? "",
    role: d.role ?? "member",
    created_by: d.createdBy ?? "",
    accepted_by: d.acceptedBy ?? null,
    accepted_at: d.acceptedAt == null ? null : invIso(d.acceptedAt),
    expires_at: invIso(d.expiresAt),
    created_at: invIso(d.createdAt),
  }
}

const acceptInviteCallable = callable<{ token: string }, { success: boolean; home_id?: string; home_name?: string; role?: string; error?: string }>(
  "acceptInvite"
)
const removeMemberCallable = callable<{ homeId: string; userId: string }, { success: boolean; error?: string }>("removeMember")
const getInviteDetailsCallable = callable<
  { token: string },
  { found: boolean; home_id?: string; home_name?: string; role?: string; expires_at?: string; accepted?: boolean; creator_name?: string | null }
>("getInviteDetails")

/** Unguessable invite token. */
function newToken(): string {
  return (globalThis.crypto?.randomUUID?.() ?? `tok-${Math.abs(Date.now())}`).replace(/-/g, "")
}

/**
 * Creates an invite link for the given home (7-day expiry).
 */
export async function createInvite(
  homeId: string,
  userId: string,
  role: "admin" | "member" | "guest" = "admin"
): Promise<ServiceResult<HomeInvite>> {
  try {
    const ref = doc(collection(db, `homes/${homeId}/invites`))
    const expires = new Date()
    expires.setDate(expires.getDate() + 7)
    await writeBatch(db)
      .set(ref, {
        token: newToken(),
        role,
        createdBy: userId,
        acceptedBy: null,
        acceptedAt: null,
        expiresAt: Timestamp.fromDate(expires),
        createdAt: serverTimestamp(),
      })
      .commit()
    const snap = await getDoc(ref)
    return { data: toInvite(homeId, ref.id, snap.data() ?? {}), error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Failed to create invite" } }
  }
}

/**
 * Lists active (non-expired, non-accepted) invites for a home.
 */
export async function getActiveInvites(homeId: string): Promise<ServiceResult<HomeInvite[]>> {
  try {
    const snap = await getDocs(collection(db, `homes/${homeId}/invites`))
    const nowIso = new Date().toISOString()
    const rows = snap.docs
      .map((d) => toInvite(homeId, d.id, d.data()))
      .filter((i) => i.accepted_by == null && i.expires_at > nowIso)
      .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
    return { data: rows, error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Failed to load invites" } }
  }
}

/**
 * Revokes (deletes) an invite.
 */
export async function revokeInvite(homeId: string, inviteId: string): Promise<ServiceResult<true>> {
  try {
    await deleteDoc(doc(db, `homes/${homeId}/invites/${inviteId}`))
    return { data: true, error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Failed to revoke invite" } }
  }
}

/**
 * Fetches invite details by token (for the accept page). The accepter isn't a
 * member yet, so a client collection-group read of invites is denied by the
 * members-only rule — this goes through the `getInviteDetails` Admin-SDK callable
 * (auth-gated, keyed on the unguessable token). Shape is unchanged for callers.
 */
export async function getInviteByToken(token: string): Promise<ServiceResult<InviteDetails>> {
  try {
    const res = await getInviteDetailsCallable({ token })
    if (!res.found) return { data: null, error: { message: "Invite not found" } }
    return {
      data: {
        invite_id: "",
        home_id: res.home_id ?? "",
        token,
        role: res.role ?? "member",
        expires_at: res.expires_at ?? "",
        accepted_by: res.accepted ? "used" : null,
        home: res.home_name ? { name: res.home_name } : null,
        creator: { full_name: res.creator_name ?? null },
      },
      error: null,
    }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Failed to load invite" } }
  }
}

/**
 * Accepts an invite. A new member can't write their own membership doc under the
 * security rules, so acceptance runs through an Admin-SDK callable that validates
 * the token/expiry and creates homes/{homeId}/members/{uid} (model §Divergences).
 */
export async function acceptInvite(token: string): Promise<
  { success: true; home_id: string; home_name: string; role: string } |
  { success: false; error: string }
> {
  try {
    const res = await acceptInviteCallable({ token })
    if (!res.success || res.error) return { success: false, error: res.error ?? "Failed to accept invite" }
    return { success: true, home_id: res.home_id!, home_name: res.home_name!, role: res.role! }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to accept invite" }
  }
}

/**
 * Fetches members of a home with their profile info.
 */
export async function getHomeMembers(homeId: string): Promise<ServiceResult<HomeMember[]>> {
  try {
    const snap = await getDocs(collection(db, `homes/${homeId}/members`))
    const members: HomeMember[] = snap.docs.map((d) => {
      const x = d.data()
      return { home_id: homeId, user_id: x.uid ?? d.id, role: x.role ?? "member", is_primary: !!x.isPrimary }
    })
    // Attach profiles from users/{uid}.
    const profiles = await Promise.all(members.map((m) => getDoc(doc(db, `users/${m.user_id}`))))
    profiles.forEach((p, i) => {
      if (p.exists()) members[i].profile = { full_name: p.data().fullName ?? null, avatar_url: p.data().avatarUrl ?? null }
    })
    return { data: members, error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Failed to load members" } }
  }
}

/**
 * Removes a member from a home. Owner-driven removal of another member isn't
 * permitted by the self-only members rule, so it runs through an owner-gated
 * Admin-SDK callable (mirrors v1's SECURITY DEFINER RPC).
 */
export async function removeMember(homeId: string, userId: string): Promise<ServiceResult<true>> {
  try {
    const res = await removeMemberCallable({ homeId, userId })
    if (!res.success) return { data: null, error: { message: res.error ?? "Failed to remove member" } }
    return { data: true, error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Failed to remove member" } }
  }
}

/**
 * Builds a shareable invite URL from a token.
 */
export function buildInviteUrl(token: string): string {
  const base = window.location.origin
  return `${base}/invite/${token}`
}
