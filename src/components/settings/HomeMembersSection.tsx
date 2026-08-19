import { useCallback, useEffect, useState } from "react"
import { doc, setDoc, serverTimestamp } from "firebase/firestore"
import { db } from "@/integrations/firebase"
import { Check, Copy, Link2, Loader2, Trash2, UserPlus, Users } from "lucide-react"
import { SectionCard } from "@/components/layout"
import { CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useAuth } from "@/modules/auth"
import {
  createInvite,
  getActiveInvites,
  revokeInvite,
  getHomeMembers,
  removeMember,
  buildInviteUrl,
  type HomeInvite,
  type HomeMember,
} from "@/modules/home"

type Props = {
  homeId: string
}

function roleLabel(role: string): string {
  switch (role) {
    case "owner": return "Owner"
    case "admin": return "Admin"
    case "member": return "Member"
    case "guest": return "Guest"
    default: return role
  }
}

function roleBadgeClass(role: string): string {
  switch (role) {
    case "owner": return "bg-primary/10 text-primary"
    case "admin": return "bg-blue-50 text-blue-700"
    case "member": return "bg-muted text-muted-foreground"
    case "guest": return "bg-amber-50 text-amber-700"
    default: return "bg-muted text-muted-foreground"
  }
}

function initials(name: string | null | undefined): string {
  if (!name) return "?"
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

export function HomeMembersSection({ homeId }: Props) {
  const { user } = useAuth()
  const userId = user?.id ?? null

  const [members, setMembers] = useState<HomeMember[]>([])
  const [invites, setInvites] = useState<HomeInvite[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [copiedToken, setCopiedToken] = useState<string | null>(null)
  const [removeTarget, setRemoveTarget] = useState<HomeMember | null>(null)
  const [removing, setRemoving] = useState(false)
  // Setting your name lived only at the very bottom of Settings, so the prompt
  // in this list pointed somewhere the user had to go hunting for — and having
  // gone there, the list did not update. Both halves are fixed here: enter it
  // in place, and reload the list on save.
  const [nameDraft, setNameDraft] = useState("")
  const [savingName, setSavingName] = useState(false)

  const currentUserRole = members.find((m) => m.user_id === userId)?.role ?? null
  const isOwner = currentUserRole === "owner"

  const [loadError, setLoadError] = useState<string | null>(null)
  // Failures from the three ACTIONS (invite / revoke / remove), separate from
  // loadError so a failed action does not replace the list with an error card.
  // Every one of these used to be swallowed: the handlers keyed off `res.data`
  // and did nothing at all on `res.error`.
  const [actionError, setActionError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [membersRes, invitesRes] = await Promise.all([
        getHomeMembers(homeId),
        getActiveInvites(homeId),
      ])
      setMembers(membersRes.data ?? [])
      setInvites(invitesRes.data ?? [])
    } catch (e) {
      // try/finally alone cleared the spinner but left the rejection unhandled
      // AND rendered an empty list — which reads as "you have no members",
      // a silent lie about who can see this home.
      setLoadError(e instanceof Error ? e.message : "Could not load members.")
    } finally {
      // In a finally, not after the await: a throw used to skip setLoading
      // entirely and leave the members list spinning with no way to retry.
      setLoading(false)
    }
  }, [homeId])

  useEffect(() => {
    load()
  }, [load])

  const handleCreateInvite = useCallback(async () => {
    if (!userId) return
    setCreating(true)
    setActionError(null)
    const res = await createInvite(homeId, userId)
    setCreating(false)
    if (res.error || !res.data) {
      setActionError(res.error?.message ?? "Could not create an invite link.")
      return
    }
    setInvites((prev) => [res.data!, ...prev])
    // Auto-copy the link. A clipboard refusal (Safari without a user gesture,
    // permissions policy) must not read as a failed invite — the invite exists
    // and its link is on screen either way.
    try {
      await navigator.clipboard.writeText(buildInviteUrl(res.data.token))
      setCopiedToken(res.data.token)
      setTimeout(() => setCopiedToken(null), 2000)
    } catch {
      setActionError("Invite created, but copying the link failed — use Copy below.")
    }
  }, [homeId, userId])

  const handleCopyLink = useCallback(async (token: string) => {
    const url = buildInviteUrl(token)
    await navigator.clipboard.writeText(url)
    setCopiedToken(token)
    setTimeout(() => setCopiedToken(null), 2000)
  }, [])

  const handleRevokeInvite = useCallback(async (inviteId: string) => {
    setActionError(null)
    const res = await revokeInvite(homeId, inviteId)
    // The result used to be discarded and the row removed unconditionally, so a
    // FAILED revoke looked exactly like a successful one: the invite vanished
    // from the list while the link stayed live. Of the silent failures here this
    // is the one that actually costs access control.
    if (res.error) {
      setActionError(`Could not revoke that invite: ${res.error.message}`)
      return
    }
    setInvites((prev) => prev.filter((i) => i.invite_id !== inviteId))
  }, [homeId])

  const handleConfirmRemove = useCallback(async () => {
    if (!removeTarget) return
    setRemoving(true)
    setActionError(null)
    const res = await removeMember(homeId, removeTarget.user_id)
    setRemoving(false)
    // Keep the dialog OPEN on failure. Closing it while the member is still in
    // the home is the success animation for an action that did not happen —
    // and removeMember legitimately refuses (last owner, non-owner caller), so
    // this path is reachable without anything being broken.
    if (res.error) {
      setActionError(`Could not remove them: ${res.error.message}`)
      return
    }
    setMembers((prev) => prev.filter((m) => m.user_id !== removeTarget.user_id))
    setRemoveTarget(null)
  }, [homeId, removeTarget])

  return (
    <>
      <SectionCard className="mt-6">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Users className="size-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Home Members</h2>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCreateInvite}
              disabled={creating}
            >
              {creating ? (
                <Loader2 className="size-4 mr-1.5 animate-spin" />
              ) : (
                <UserPlus className="size-4 mr-1.5" />
              )}
              Invite
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            People who can view and manage this home.
          </p>

          {actionError && (
            <p role="alert" className="text-sm text-destructive mb-3">
              {actionError}
            </p>
          )}

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : loadError ? (
            <div className="text-sm">
              <p className="text-destructive">{loadError}</p>
              <button type="button" onClick={() => void load()} className="mt-1 font-semibold text-primary">
                Try again
              </button>
            </div>
          ) : (
            <>
              {/* Members list */}
              <div className="space-y-1 mb-4">
                {members.map((m) => (
                  <div
                    key={m.user_id}
                    className="flex items-center justify-between py-2 border-b border-border last:border-0 group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
                        {initials(m.profile?.full_name)}
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {/* "Unknown" read as the app having lost track of someone.
                              It simply has no name for them. */}
                          {m.profile?.full_name ?? (m.user_id === userId ? "You" : "Member")}
                          {m.user_id === userId && m.profile?.full_name && (
                            <span className="text-muted-foreground font-normal ml-1">(you)</span>
                          )}
                        </p>
                        {/* Enter it HERE. Pointing at a field far down the page was
                            the complaint, and the list did not refresh afterwards
                            either — so this saves and reloads in place. */}
                        {m.user_id === userId && !m.profile?.full_name && (
                          <form
                            className="mt-1.5 flex items-center gap-2"
                            onSubmit={async (e) => {
                              e.preventDefault()
                              const name = nameDraft.trim()
                              if (!name || !userId) return
                              setSavingName(true)
                              try {
                                await setDoc(
                                  doc(db, `users/${userId}`),
                                  { fullName: name, updatedAt: serverTimestamp() },
                                  { merge: true },
                                )
                                setNameDraft("")
                                await load()
                              } finally {
                                setSavingName(false)
                              }
                            }}
                          >
                            <input
                              value={nameDraft}
                              onChange={(e) => setNameDraft(e.target.value)}
                              placeholder="Add your name"
                              aria-label="Your display name"
                              className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary"
                            />
                            <Button type="submit" size="sm" variant="outline" disabled={!nameDraft.trim() || savingName}>
                              {savingName ? "Saving…" : "Save"}
                            </Button>
                          </form>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${roleBadgeClass(m.role)}`}>
                        {roleLabel(m.role)}
                      </span>
                      {isOwner && m.user_id !== userId && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground sm:opacity-0 sm:group-hover:opacity-100 hover:text-destructive transition-opacity"
                          onClick={() => setRemoveTarget(m)}
                          aria-label={`Remove ${m.profile?.full_name ?? "member"}`}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Active invites */}
              {invites.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Pending Invites
                  </p>
                  <div className="space-y-2">
                    {invites.map((inv) => {
                      const isCopied = copiedToken === inv.token
                      const expiresIn = Math.ceil(
                        (new Date(inv.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                      )
                      return (
                        <div
                          key={inv.invite_id}
                          className="flex items-center justify-between py-1.5 text-sm"
                        >
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Link2 className="size-3.5" />
                            <span>
                              Invite link · expires in {expiresIn}d
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs"
                              onClick={() => handleCopyLink(inv.token)}
                            >
                              {isCopied ? (
                                <><Check className="size-3 mr-1" /> Copied</>
                              ) : (
                                <><Copy className="size-3 mr-1" /> Copy Link</>
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-muted-foreground hover:text-destructive"
                              onClick={() => handleRevokeInvite(inv.invite_id)}
                              aria-label="Revoke invite"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </SectionCard>

      {/* Remove member confirmation */}
      <Dialog
        open={!!removeTarget}
        onOpenChange={(open) => {
          if (!open) { setRemoveTarget(null); setActionError(null) }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {removeTarget?.profile?.full_name ?? "member"}?</DialogTitle>
            <DialogDescription>
              They will lose access to this home. You can re-invite them later.
            </DialogDescription>
          </DialogHeader>
          {actionError && (
            <p role="alert" className="text-sm text-destructive">
              {actionError}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setRemoveTarget(null); setActionError(null) }}
              disabled={removing}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmRemove} disabled={removing}>
              {removing ? "Removing..." : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
