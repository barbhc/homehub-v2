/**
 * Where Settings and the things that left it live (design/settings-your-home.md).
 *
 * Settings is one short menu at `/settings`; each row opens a page of its own
 * at `/settings/<pane>`. Rooms moved to Items and custom tasks to Tasks. Every
 * link in the app names its address through these constants, and the old
 * `/settings#anchor` addresses (bookmarks, pushes already delivered, an open
 * tab across a deploy) are answered by `settingsHashRedirect`.
 */
import { YOUR_HOME_PATH, yourHomePart } from "@/lib/yourHome"

export const SETTINGS_PATH = "/settings"

/** The pages behind the menu's rows, in menu order. `internal` is dev_tools only. */
export const SETTINGS_PANES = [
  "account",
  "members",
  "task-level",
  "homes",
  "notifications",
  "appearance",
  "export",
  "privacy",
  "help",
  "internal",
] as const
export type SettingsPane = (typeof SETTINGS_PANES)[number]

export const isSettingsPane = (raw: string | undefined): raw is SettingsPane =>
  SETTINGS_PANES.some((p) => p === raw)

export const settingsPane = (pane: SettingsPane) => `${SETTINGS_PATH}/${pane}`

/** Each pane's name: its menu row and its page heading say the same words. */
export const SETTINGS_PANE_TITLE: Record<SettingsPane, string> = {
  account: "Account",
  members: "Members",
  "task-level": "Task level",
  homes: "Homes",
  notifications: "Notifications",
  appearance: "Appearance",
  export: "Export your data",
  privacy: "Data & privacy",
  help: "Report a problem",
  internal: "Internal tools",
}

/** Rooms are managed from Items. Registered before `/inventory/:id`. */
export const ROOMS_PATH = "/inventory/rooms"
/** A person's own tasks are added from Tasks. */
export const OWN_TASKS_PATH = "/maintenance/custom"
export const PROVIDERS_PATH = "/providers"

/**
 * The old one-page Settings' anchors and where each section lives now.
 * `manuals`, `beta` and `level` have no page a person can open (internal tools,
 * and the retired interface picker), so they land on the menu.
 */
export const OLD_SETTINGS_ANCHORS: Readonly<Record<string, string>> = {
  account: settingsPane("account"),
  homes: settingsPane("homes"),
  appearance: settingsPane("appearance"),
  members: settingsPane("members"),
  "task-level": settingsPane("task-level"),
  notifications: settingsPane("notifications"),
  reminders: settingsPane("notifications"),
  privacy: settingsPane("privacy"),
  data: settingsPane("export"),
  "home-profile": yourHomePart("basics"),
  "home-setup": YOUR_HOME_PATH,
  "house-rules": yourHomePart("rules"),
  providers: PROVIDERS_PATH,
  rooms: ROOMS_PATH,
  tasks: OWN_TASKS_PATH,
  manuals: SETTINGS_PATH,
  beta: SETTINGS_PATH,
  level: SETTINGS_PATH,
}

/**
 * Where `/settings#<hash>` should go instead, or null when the hash is not an
 * old anchor (the menu shows as it is). An anchor that now means the menu
 * itself still returns the path, so the stale hash leaves the address bar.
 */
export function settingsHashRedirect(hash: string): string | null {
  const anchor = hash.startsWith("#") ? hash.slice(1) : hash
  if (!anchor || !Object.hasOwn(OLD_SETTINGS_ANCHORS, anchor)) return null
  return OLD_SETTINGS_ANCHORS[anchor]
}
