/**
 * Save the first minute once there is an account (design/account-after-list.md).
 *
 * Order matters, and every step is safe to run again:
 *   1. Does this account already have a home? A FAILED lookup stops here —
 *      creating a home without knowing is how duplicate homes get minted.
 *      A home of theirs that was never set up (no zip, no home type, never
 *      completed) is theirs to finish: it gets this setup, so a save that died
 *      after creating the home — before its id came back, or before the profile
 *      write — never leaves an empty home plus a "you already have one" prompt.
 *      Any other home is never written over: the caller asks before adding
 *      the tasks to it.
 *   2. Create the home (or reuse the one a failed attempt already made).
 *   3. Write the profile the steps collected: zip, area, home type, answers.
 *   4. Add each picked task, skipping any a failed attempt already added.
 */
import { collection, getDocs } from "firebase/firestore"
import { db } from "@/integrations/firebase"
import { createHome, getPrimaryHome } from "./homeService"
import { getHomeProfile, upsertHomeProfile, type HomeProfile } from "./homeProfileService"
import type { DraftProfile, PendingTask } from "./firstMinuteDraft"
import { addLibraryTask } from "@/modules/care/services/careSuggestionService"
import { entryByKey, type ExistingTask } from "../../../../shared/care/library"
import { assertServed } from "@/lib/assertServed"
import { track } from "@/lib/analytics"

/** D1a: the home is named for her; she renames it from the switcher. */
export const FIRST_HOME_NAME = "My home"

export type CommitInput = {
  userId: string
  patch: DraftProfile
  tasks: PendingTask[]
  createdHomeId: string | null
  addedKeys: string[]
}

export type CommitResult =
  | { kind: "saved"; homeId: string; addedKeys: string[] }
  /** The account already has a different home. Nothing was written. */
  | { kind: "existing"; homeId: string; homeName: string }
  | { kind: "failed"; message: string; createdHomeId: string | null; addedKeys: string[] }

const OFFLINE = "Unable to connect. Check your internet connection and try again."

export async function commitFirstMinute(input: CommitInput): Promise<CommitResult> {
  const fail = (message: string, createdHomeId = input.createdHomeId, addedKeys = input.addedKeys): CommitResult =>
    ({ kind: "failed", message, createdHomeId, addedKeys })

  const existing = await getPrimaryHome()
  if (existing.error) {
    console.error("[first minute] membership lookup failed before saving:", existing.error.message)
    return fail("We couldn't check your account just now. Try again in a moment.")
  }
  if (existing.data && existing.data.home_id !== input.createdHomeId) {
    const unset = await neverSetUp(existing.data.home_id, existing.data.created_by ?? null, input.userId)
    if (unset === "unknown") return fail("We couldn't check your account just now. Try again in a moment.")
    if (!unset) return { kind: "existing", homeId: existing.data.home_id, homeName: existing.data.name }
  }

  let homeId = existing.data?.home_id ?? null
  if (!homeId) {
    const created = await createHome({ name: FIRST_HOME_NAME, userId: input.userId })
    if (created.error || !created.data) {
      const msg = created.error?.message ?? ""
      console.error("[first minute] could not create the home:", msg)
      return fail(msg === "Failed to fetch" ? OFFLINE : "Couldn't create your home. Nothing was saved. Try again.")
    }
    homeId = created.data.homeId
    track("home_created", { home_id: homeId })
  }

  const profile = await upsertHomeProfile(homeId, input.patch)
  if (profile.error) {
    console.warn(`[first minute] could not save the profile (home ${homeId}):`, profile.error.message)
    return fail("Couldn't save your home. Check your connection and try again.", homeId)
  }

  const added = await addTasks(homeId, input.tasks, input.addedKeys)
  if (added.failed.length) return fail(added.message, homeId, added.addedKeys)
  return { kind: "saved", homeId, addedKeys: added.addedKeys }
}

/**
 * Add the picked tasks to a home that already existed ("Add them to it").
 * Its own profile answers are left alone.
 */
export async function addToExistingHome(homeId: string, tasks: PendingTask[], addedKeys: string[]): Promise<CommitResult> {
  const added = await addTasks(homeId, tasks, addedKeys)
  if (added.failed.length) return { kind: "failed", message: added.message, createdHomeId: null, addedKeys: added.addedKeys }
  return { kind: "saved", homeId, addedKeys: added.addedKeys }
}

/** Their own home, with nothing set up yet? "unknown" when the profile can't be read. */
async function neverSetUp(homeId: string, createdBy: string | null, userId: string): Promise<boolean | "unknown"> {
  if (createdBy !== userId) return false
  const p = await getHomeProfile(homeId)
  if (p.error) {
    console.warn(`[first minute] could not read home ${homeId} to see if it was set up:`, p.error.message)
    return "unknown"
  }
  return !p.data || (!p.data.zip && !p.data.home_type && !p.data.climate && !p.data.completed_at)
}

async function addTasks(homeId: string, tasks: PendingTask[], already: string[]) {
  const addedKeys = [...already]
  const failed: string[] = []
  for (const t of tasks) {
    if (addedKeys.includes(t.key)) continue
    const entry = entryByKey(t.key)
    if (!entry) {
      // A key from an older app version that the library no longer has: there
      // is nothing to add, and refusing the whole save over it would strand her.
      console.warn(`[first minute] no library entry for ${t.key}; skipped`)
      continue
    }
    const res = await addLibraryTask(homeId, null, entry, { firstDue: t.due })
    if (res.error) {
      console.warn(`[first minute] could not add ${t.key} (home ${homeId}):`, res.error.message)
      failed.push(entry.title)
    } else addedKeys.push(t.key)
  }
  const message = failed.length === 0
    ? ""
    : addedKeys.length === already.length && addedKeys.length === 0
      ? "Couldn’t add your tasks. Check your connection and try again."
      : `Couldn’t add ${failed.map((t) => `“${t}”`).join(" or ")}. The others were added. Try again for the rest.`
  return { addedKeys, failed, message }
}

// ── An existing home's zip (seventeen fixes, mock m5) ─────────────────────────
//
// Home's "Add your zip" row runs the same three screens for a SIGNED-IN person
// whose home already exists. No home is created and no account is asked for:
// the steps' answers go onto THIS home's profile, and only the tasks she picks
// are added — the same writes as above, through the same helpers.

export type HomeForZip = { profile: HomeProfile; existing: ExistingTask[] }

/**
 * The home's profile and its tasks, read from the server. The list it feeds
 * offers only what the home does not already have, so an offline cache-miss
 * that came back EMPTY would offer every task again — that read is refused
 * (assertServed), never believed (memory: the fromCache trap).
 */
export async function readHomeForZip(homeId: string): Promise<{ data: HomeForZip; error: null } | { data: null; error: string }> {
  const profile = await getHomeProfile(homeId)
  if (profile.error || !profile.data) {
    return { data: null, error: profile.error?.message ?? "Couldn't read your home." }
  }
  try {
    const snap = await getDocs(collection(db, `homes/${homeId}/taskTemplates`))
    assertServed(snap, "tasks")
    const existing: ExistingTask[] = []
    for (const d of snap.docs) {
      const t = d.data()
      if (t.deletedAt != null || t.isActive === false) continue
      const schedule = t.schedule as { scheduleType?: unknown } | null | undefined
      existing.push({
        title: typeof t.title === "string" ? t.title : "",
        scheduleType: typeof schedule?.scheduleType === "string" ? schedule.scheduleType : null,
      })
    }
    return { data: { profile: profile.data, existing }, error: null }
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : "Couldn't read your tasks." }
  }
}

/**
 * Save the zip screens' answers to an existing home, then add the picked
 * tasks. What the home already answered is not taken back: a home type it
 * already has, and the date its profile was first completed, are left as
 * they are. Safe to run again — tasks already added (`addedKeys`) are skipped.
 */
export async function saveZipToHome(
  homeId: string,
  current: HomeProfile,
  patch: DraftProfile,
  tasks: PendingTask[],
  addedKeys: string[],
): Promise<CommitResult> {
  const write: DraftProfile = { ...patch }
  if (current.completed_at) delete write.completed_at
  if (current.home_type) delete write.home_type
  const profile = await upsertHomeProfile(homeId, write)
  if (profile.error) {
    console.warn(`[add zip] could not save the profile (home ${homeId}):`, profile.error.message)
    return { kind: "failed", message: "Couldn't save your zip. Check your connection and try again.", createdHomeId: null, addedKeys }
  }
  const added = await addTasks(homeId, tasks, addedKeys)
  if (added.failed.length) return { kind: "failed", message: added.message, createdHomeId: null, addedKeys: added.addedKeys }
  return { kind: "saved", homeId, addedKeys: added.addedKeys }
}
