import { useCallback, useEffect, useState } from "react"
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

  const currentUserRole = members.find((m) => m.user_id === userId)?.role ?? null
  const isOwner = currentUserRole === "owner"

  const load = useCallback(async () => {
    setLoading(true)
    const [membersRes, invitesRes] = await Promise.all([
      getHomeMembers(homeId),
      getActiveInvites(homeId),
    ])
    setMembers(membersRes.data ?? [])
    setInvites(invitesRes.data ?? [])
    setLoading(false)
  }, [homeId])

  useEffect(() => {
    load()
  }, [load])

  const handleCreateInvite = useCallback(async () => {
    if (!userId) return
    setCreating(true)
    const res = await createInvite(homeId, userId)
    if (res.data) {
      setInvites((prev) => [res.data!, ...prev])
      // Auto-copy the link
      const url = buildInviteUrl(res.data.token)
      await navigator.clipboard.writeText(url)
      setCopiedToken(res.data.token)
      setTimeout(() => setCopiedToken(null), 2000)
    }
    setCreating(false)
  }, [homeId, userId])

  const handleCopyLink = useCallback(async (token: string) => {
    const url = buildInviteUrl(token)
    await navigator.clipboard.writeText(url)
    setCopiedToken(token)
    setTimeout(() => setCopiedToken(null), 2000)
  }, [])

  const handleRevokeInvite = useCallback(async (inviteId: string) => {
    await revokeInvite(inviteId)
    setInvites((prev) => prev.filter((i) => i.invite_id !== inviteId))
  }, [])

  const handleConfirmRemove = useCallback(async () => {
    if (!removeTarget) return
    setRemoving(true)
    const res = await removeMember(homeId, removeTarget.user_id)
    if (res.data) {
      setMembers((prev) => prev.filter((m) => m.user_id !== removeTarget.user_id))
    }
    setRemoving(false)
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

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
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
                          {m.profile?.full_name ?? "Unknown"}
                          {m.user_id === userId && (
                            <span className="text-muted-foreground font-normal ml-1">(you)</span>
                          )}
                        </p>
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
      <Dialog open={!!removeTarget} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {removeTarget?.profile?.full_name ?? "member"}?</DialogTitle>
            <DialogDescription>
              They will lose access to this home. You can re-invite them later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveTarget(null)} disabled={removing}>
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
