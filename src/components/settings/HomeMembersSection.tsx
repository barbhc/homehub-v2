import { useCallback, useEffect, useState } from "react"
import { useDepsChanged } from "@/hooks/useDepsChanged"
import { useIsCurrent } from "@/hooks/useIsCurrent"
import { doc, setDoc, serverTimestamp } from "firebase/firestore"
import { db } from "@/integrations/firebase"
import { Check, Copy, Link2, Loader2, ShareIcon, Trash2, UserIcon, UserPlus } from "lucide-react"
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
import { personInitials, personLabel } from "@/lib/personName"

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
    case "admin": return "bg-[var(--hh-info-soft)] text-[var(--hh-info)]"
    case "member": return "bg-muted text-muted-foreground"
    case "guest": return "bg-[var(--hh-warn-soft)] text-[var(--hh-warn)]"
    default: return "bg-muted text-muted-foreground"
  }
}

type AccessRead = { members: HomeMember[]; invites: HomeInvite[] } | { error: string }

/** A home's members and active invites — or why they could not be read. */
async function readAccess(homeId: string): Promise<AccessRead> {
  try {
    const [membersRes, invitesRes] = await Promise.all([
      getHomeMembers(homeId),
      getActiveInvites(homeId),
    ])
    return { members: membersRes.data ?? [], invites: invitesRes.data ?? [] }
  } catch (e) {
    // try/finally alone cleared the spinner but left the rejection unhandled
    // AND rendered an empty list — which reads as "you have no members",
    // a silent lie about who can see this home.
    return { error: e instanceof Error ? e.message : "Could not load members." }
  }
}

const DAY_MS = 1000 * 60 * 60 * 24

/** Whole days until an invite expires, counted from `now` (never below 0). */
function daysLeft(expiresAt: string, now: number): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / DAY_MS))
}

/** The plain words for a refused copy. The link is shown beside it (see
 *  `manualToken`), so "press and hold" points at something on screen. */
const COPY_REFUSED = "Couldn't copy. Press and hold the link to copy it."

export function HomeMembersSection({ homeId }: Props) {
  const { user } = useAuth()
  const userId = user?.id ?? null

  const [members, setMembers] = useState<HomeMember[]>([])
  const [invites, setInvites] = useState<HomeInvite[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [copiedToken, setCopiedToken] = useState<string | null>(null)
  /** The invite just made on this screen — it gets the "ready" line. */
  const [freshToken, setFreshToken] = useState<string | null>(null)
  /** An invite whose copy was refused: its link is shown to press and hold. */
  const [manualToken, setManualToken] = useState<string | null>(null)
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
  /** The clock the invites' "expires in Nd" counts from, read when the list
   *  lands rather than on every render (react-hooks/purity). */
  const [readAt, setReadAt] = useState(() => Date.now())

  /** Lands a read: the lists, or the error — and the spinner stops either way.
   *  (A throw used to skip setLoading entirely and leave the members list
   *  spinning with no way to retry.) */
  const applyAccess = useCallback((res: AccessRead) => {
    if ("error" in res) setLoadError(res.error)
    else {
      setMembers(res.members)
      setInvites(res.invites)
    }
    setReadAt(Date.now())
    setLoading(false)
  }, [])

  // Every read lands only while its home is still the one on screen (H4): home
  // A's members answering after a switch to B used to replace B's list — who
  // can see a home is the last thing to show for the wrong one.
  const isCurrentHome = useIsCurrent(homeId)

  // Retry, and the re-read after an action. One held from before a switch (the
  // name save below can outlive one) does not start: it would put a spinner on
  // the next home's list and then have its answer dropped.
  const load = useCallback(async () => {
    if (!isCurrentHome(homeId)) return
    setLoading(true)
    setLoadError(null)
    const res = await readAccess(homeId)
    if (isCurrentHome(homeId)) applyAccess(res)
  }, [homeId, applyAccess, isCurrentHome])

  // The first read and a home switch: the spinner starts in the render that
  // switches (it starts on for the first), and the effect only reads.
  if (useDepsChanged([homeId])) {
    setLoading(true)
    setLoadError(null)
  }
  useEffect(() => {
    void readAccess(homeId).then((res) => {
      if (isCurrentHome(homeId)) applyAccess(res)
    })
  }, [homeId, applyAccess, isCurrentHome])

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
    // The new invite's countdown starts now, not at the last list read.
    setReadAt(Date.now())
    // No automatic copy (seventeen fixes, 2026-11-25). Safari allows a
    // clipboard write only DURING a tap, and this runs after the server
    // answered — so on an iPhone the old auto-copy failed every time and the
    // first thing a new invite said was "copying the link failed". The invite
    // says it is ready; Share Link and Copy below are the taps that send it.
    setFreshToken(res.data.token)
  }, [homeId, userId])

  // Copy runs INSIDE the tap: writeText is the first thing the handler calls,
  // before any await, which is what Safari's user-activation rule needs.
  const handleCopyLink = useCallback((token: string): Promise<void> => {
    setActionError(null)
    let write: Promise<void>
    try {
      write = navigator.clipboard.writeText(buildInviteUrl(token))
    } catch (e) {
      // No clipboard at all (an insecure context) throws synchronously.
      write = Promise.reject(e)
    }
    return write.then(
      () => {
        setManualToken(null)
        setCopiedToken(token)
        setTimeout(() => setCopiedToken(null), 2000)
      },
      (e: unknown) => {
        console.warn("[members] the clipboard refused the invite link:", e instanceof Error ? e.message : e)
        setManualToken(token)
        setActionError(COPY_REFUSED)
      },
    )
  }, [])

  // Share Link: the system share sheet where there is one (iPhone Safari and
  // the iOS shell's WebView both have navigator.share). Without it, or when it
  // fails for any reason other than the person closing the sheet, copy.
  const handleShareLink = useCallback(async (token: string) => {
    setActionError(null)
    const share = typeof navigator.share === "function" ? navigator.share.bind(navigator) : null
    if (!share) return handleCopyLink(token)
    try {
      await share({ title: "Join my home on Homehub", url: buildInviteUrl(token) })
    } catch (e) {
      // Closing the sheet is a choice, not a failure: nothing to say.
      if (e instanceof DOMException && e.name === "AbortError") return
      console.warn("[members] share failed, copying instead:", e instanceof Error ? e.message : e)
      await handleCopyLink(token)
    }
  }, [handleCopyLink])

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

  const freshInvite = freshToken ? invites.find((i) => i.token === freshToken) ?? null : null

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
      <SectionCard>
        <CardContent className="p-4">
          {/* The page (Settings → Members) carries the heading. */}
          <div className="flex items-start justify-between gap-3 mb-4">
            <p className="min-w-0 flex-1 text-sm text-muted-foreground">
              People who can view and manage this home.
            </p>
            <Button
              className="shrink-0"
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

          {freshInvite && (
            <p role="status" className="text-sm text-muted-foreground mb-3">
              Invite link ready. It works for {daysLeft(freshInvite.expires_at, readAt)} {daysLeft(freshInvite.expires_at, readAt) === 1 ? "day" : "days"}.
            </p>
          )}

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
                        {personInitials(m.profile?.full_name, { isSelf: m.user_id === userId, email: user?.email ?? null })
                          || <UserIcon className="size-4" aria-hidden />}
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {/* "Unknown" read as the app having lost track of someone.
                              It simply has no name for them. */}
                          {personLabel(m.profile?.full_name, { isSelf: m.user_id === userId })}
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
                              setActionError(null)
                              try {
                                await setDoc(
                                  doc(db, `users/${userId}`),
                                  { fullName: name, updatedAt: serverTimestamp() },
                                  { merge: true },
                                )
                                setNameDraft("")
                                await load()
                              } catch (err) {
                                // The typed name stays in the field; the section
                                // says it didn't save (it was an unhandled rejection).
                                console.warn(`[members] could not save the display name for ${userId}:`, err instanceof Error ? err.message : err)
                                setActionError("Couldn't save your name. Check your connection and try again.")
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
                          className="text-muted-foreground sm:pointer-fine:opacity-0 sm:pointer-fine:group-hover:opacity-100 sm:pointer-fine:focus-visible:opacity-100 hover:text-destructive transition-opacity"
                          onClick={() => setRemoveTarget(m)}
                          aria-label={`Remove ${m.profile?.full_name?.trim() || "this member"}`}
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
                      const expiresIn = daysLeft(inv.expires_at, readAt)
                      return (
                        <div key={inv.invite_id} className="py-1.5 text-sm" data-testid="invite-row">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Link2 className="size-3.5" />
                              <span>
                                Invite link · expires in {expiresIn}d
                              </span>
                            </div>
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
                          {/* m7: two buttons the same size under the invite —
                              Share Link filled, Copy outlined. */}
                          <div className="mt-2 grid grid-cols-2 gap-3">
                            <Button size="lg" className="gap-2" onClick={() => void handleShareLink(inv.token)}>
                              <ShareIcon className="size-[18px]" aria-hidden /> Share Link
                            </Button>
                            <Button size="lg" variant="outline" className="gap-2" onClick={() => void handleCopyLink(inv.token)}>
                              {isCopied ? (
                                <><Check className="size-[18px]" aria-hidden /> Copied</>
                              ) : (
                                <><Copy className="size-[18px]" aria-hidden /> Copy</>
                              )}
                            </Button>
                          </div>
                          {manualToken === inv.token && (
                            <input
                              readOnly
                              value={buildInviteUrl(inv.token)}
                              aria-label="Invite link"
                              onFocus={(e) => e.currentTarget.select()}
                              className="mt-2 w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground"
                            />
                          )}
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
            <DialogTitle>Remove {removeTarget?.profile?.full_name?.trim() || "this member"}?</DialogTitle>
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
