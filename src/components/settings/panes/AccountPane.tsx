/**
 * Settings → Account: the display name and which address is signed in.
 * Moved from the one-page Settings unchanged (design/settings-your-home.md);
 * Sign out is on the menu.
 */
import { useCallback, useEffect, useState } from "react"
import { Loader2Icon } from "lucide-react"
import { SectionCard } from "@/components/layout"
import { CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/modules/auth"
import { getDisplayName, setDisplayName } from "@/lib/userProfile"

export function AccountPane() {
  const { user } = useAuth()
  const userId = user?.id
  const [profileName, setProfileName] = useState("")
  const [profileNameDraft, setProfileNameDraft] = useState("")
  const [profileLoading, setProfileLoading] = useState(true)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileSaved, setProfileSaved] = useState(false)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    getDisplayName(userId).then(
      (name) => {
        if (cancelled) return
        setProfileName(name)
        setProfileNameDraft(name)
        setProfileLoading(false)
      },
      (e: unknown) => {
        console.warn(`[settings] could not load the display name for ${userId}:`, e instanceof Error ? e.message : e)
        if (cancelled) return
        setProfileError(e instanceof Error ? e.message : "Failed to load profile")
        setProfileLoading(false)
      },
    )
    return () => {
      cancelled = true
    }
  }, [userId])

  const handleSaveProfile = useCallback(async () => {
    if (!userId) return
    const trimmed = profileNameDraft.trim()
    if (trimmed === profileName) return
    setProfileSaving(true)
    setProfileError(null)
    setProfileSaved(false)
    try {
      await setDisplayName(userId, trimmed)
      setProfileName(trimmed)
      setProfileSaved(true)
      setTimeout(() => setProfileSaved(false), 2000)
    } catch (err) {
      console.warn(`[settings] could not save the display name for ${userId}:`, err instanceof Error ? err.message : err)
      setProfileError(err instanceof Error ? err.message : "Failed to save profile")
    } finally {
      setProfileSaving(false)
    }
  }, [userId, profileNameDraft, profileName])

  return (
    <SectionCard>
      <CardContent className="p-4 space-y-4">
        <div className="space-y-2">
          <label htmlFor="profile-name" className="text-sm font-medium">
            Display name
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              id="profile-name"
              value={profileNameDraft}
              onChange={(e) => {
                setProfileNameDraft(e.target.value)
                setProfileSaved(false)
              }}
              placeholder="Your name"
              disabled={profileLoading || profileSaving}
              className="sm:max-w-xs"
            />
            <Button
              onClick={() => void handleSaveProfile()}
              disabled={
                profileLoading ||
                profileSaving ||
                profileNameDraft.trim() === profileName
              }
              className="sm:w-auto"
            >
              {profileSaving ? (
                <>
                  <Loader2Icon className="size-4 mr-2 animate-spin" aria-hidden />
                  Saving…
                </>
              ) : (
                "Save"
              )}
            </Button>
          </div>
          {profileError && (
            <p role="alert" className="text-sm text-destructive">{profileError}</p>
          )}
          {profileSaved && !profileError && (
            <p role="status" className="text-sm text-muted-foreground">Saved.</p>
          )}
        </div>
        {user?.email && (
          <p className="text-sm text-muted-foreground">
            Signed in as <span className="font-medium text-foreground">{user.email}</span>
          </p>
        )}
      </CardContent>
    </SectionCard>
  )
}
