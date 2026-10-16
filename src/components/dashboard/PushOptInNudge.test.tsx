/**
 * The Home notifications nudge says everything the switch turns on
 * (Apple-design audit, 2026-10-15).
 *
 * It used to promise a push "only when an Essential maintenance task is due",
 * while turning notifications on also enables the Sunday summary and the
 * buy-ahead pushes by default (DEFAULT_NOTIFICATION_PREFS). An ask that names
 * one class of notification and delivers three is the agreement the product
 * principles forbid assuming. The owner chose to name all three in the prompt.
 */
import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { PushOptInNudge } from "./PushOptInNudge"
import { DEFAULT_NOTIFICATION_PREFS } from "../../../shared/notifications/preferences"

vi.mock("@/lib/pushNotifications", () => ({
  isPushSupported: () => true,
  isSubscribed: async () => false,
  subscribeToPush: vi.fn(),
}))
vi.mock("@/lib/nativePush", () => ({
  isNativePlatform: () => false,
  isNativePushRegistered: async () => false,
  isNativePushTurnedOff: () => false,
  registerNativePush: vi.fn(),
}))

describe("PushOptInNudge copy", () => {
  it("names the reminders, the Sunday summary, and the buy-ahead heads-up", async () => {
    render(<MemoryRouter><PushOptInNudge userId="u1" homeId="h1" /></MemoryRouter>)

    // The morning push also carries deadlines of any tier and any task whose
    // bell is on (composeMorning) — "Essential" alone would under-name it.
    expect(await screen.findByText("Reminders for Essential tasks, deadlines and any task you turn on")).toBeInTheDocument()
    expect(screen.getByText("A Sunday summary of your week")).toBeInTheDocument()
    expect(screen.getByText("A heads-up when a part should be bought ahead")).toBeInTheDocument()
    // The old promise that nothing else would ping is gone.
    expect(screen.queryByText(/won't ping you/)).toBeNull()
    expect(screen.queryByText(/only when an Essential/)).toBeNull()
  })

  it("the three it names are the three that are on by default", () => {
    // If a default changes, the prompt's promise has to change with it.
    expect(DEFAULT_NOTIFICATION_PREFS.events.task_reminders.push).toBe(true)
    expect(DEFAULT_NOTIFICATION_PREFS.weekly_digest.enabled).toBe(true)
    expect(DEFAULT_NOTIFICATION_PREFS.weekly_digest.day).toBe(0) // Sunday
    expect(DEFAULT_NOTIFICATION_PREFS.events.buy_ahead.push).toBe(true)
  })
})
