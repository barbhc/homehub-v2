/**
 * Settings' addresses (design/settings-your-home.md): the pages behind the
 * menu, and where each anchor of the old one-page Settings lands.
 */
import { describe, expect, it } from "vitest"
import {
  OLD_SETTINGS_ANCHORS, OWN_TASKS_PATH, ROOMS_PATH, SETTINGS_PANES, SETTINGS_PANE_TITLE, isSettingsPane, settingsHashRedirect, settingsPane,
} from "./settingsPaths"

describe("settings panes", () => {
  it("are the ten pages the menu opens, by address", () => {
    expect(SETTINGS_PANES.map(settingsPane)).toEqual([
      "/settings/account", "/settings/members", "/settings/task-level", "/settings/homes", "/settings/notifications",
      "/settings/appearance", "/settings/export", "/settings/privacy", "/settings/help", "/settings/internal",
    ])
  })

  it("each has a sentence-case name", () => {
    for (const pane of SETTINGS_PANES) {
      const title = SETTINGS_PANE_TITLE[pane]
      expect(title, pane).toMatch(/^[A-Z][a-z]/)
      // Sentence case: only the first word is capitalised.
      expect(title.slice(1), pane).toBe(title.slice(1).toLowerCase())
    }
  })

  it("only those are panes", () => {
    for (const pane of SETTINGS_PANES) expect(isSettingsPane(pane)).toBe(true)
    for (const raw of ["", "rooms", "tasks", "Account", "notifications/", "toString", "constructor", undefined]) {
      expect(isSettingsPane(raw), String(raw)).toBe(false)
    }
  })
})

describe("the old one-page Settings' anchors", () => {
  it.each([
    ["notifications", "/settings/notifications"],
    ["task-level", "/settings/task-level"],
    ["members", "/settings/members"],
    ["homes", "/settings/homes"],
    ["appearance", "/settings/appearance"],
    ["privacy", "/settings/privacy"],
    ["account", "/settings/account"],
    ["data", "/settings/export"],
    ["home-profile", "/your-home?part=basics"],
    ["home-setup", "/your-home"],
    ["house-rules", "/your-home?part=rules"],
    ["providers", "/providers"],
    ["rooms", "/inventory/rooms"],
    ["tasks", "/maintenance/custom"],
    ["reminders", "/settings/notifications"],
    ["manuals", "/settings"],
    ["beta", "/settings"],
    ["level", "/settings"],
  ])("#%s → %s", (anchor, to) => {
    expect(settingsHashRedirect(`#${anchor}`)).toBe(to)
    expect(settingsHashRedirect(anchor)).toBe(to)
  })

  it("that table is the whole map", () => {
    expect(Object.keys(OLD_SETTINGS_ANCHORS)).toHaveLength(18)
  })

  it("no hash, an unknown hash, or an Object.prototype name is not a redirect", () => {
    for (const hash of ["", "#", "#nope", "#Notifications", "#toString", "#constructor", "#__proto__"]) {
      expect(settingsHashRedirect(hash), hash).toBeNull()
    }
  })

  it("rooms and custom tasks have addresses under the tabs they moved to", () => {
    expect(ROOMS_PATH).toBe("/inventory/rooms")
    expect(OWN_TASKS_PATH).toBe("/maintenance/custom")
  })
})
