import type { DriveStep } from "driver.js"

/**
 * A tour step that also KNOWS WHICH SCREEN IT IS TALKING ABOUT.
 *
 * The tour points at bottom-nav buttons and describes what lives behind each
 * one, but it never went there — so a tester read "Ask here and get answers
 * from your manuals" while the Home screen sat unchanged behind the bubble and
 * reported, exactly right: "I have no idea that it's referring to a different
 * tab." Describing a place without showing it is a caption with no picture.
 */
export type TourStep = DriveStep & { route?: string }

/**
 * VOICE — five rules, each one reverse-engineered from a correction the owner
 * actually made, which is the only reason to trust them (2026-08-27).
 *
 * 1. Say what they GET, not what we do. "We'll read it for the upkeep" beats
 *    "maintenance tasks are extracted automatically" — the second describes our
 *    pipeline to someone holding a dishwasher manual.
 * 2. Their nouns, and the button's word. Items not inventory, label not
 *    nameplate. A bubble pointing at a button uses that button's name; an
 *    action that changes name mid-flow is one people lose track of.
 * 3. Warmth comes from rhythm, not decoration. No exclamation marks, no
 *    rhetorical questions, no "simply". Personality lives in a short sentence
 *    with a turn in it.
 * 4. Timing is a nudge, not a deadline. A house does not issue due dates.
 *    Deadline language everywhere means nothing can be urgent anywhere — keep
 *    the register calm so the rare time-critical thing can sound different.
 * 5. Never promise what we have not checked. "Answers from its own manual"
 *    survived because web search is opt-in and off. A warranty example did NOT
 *    survive: warranty is parsed into item fields, and Ask searches chunks, so
 *    the one question it would have invited is the one Ask cannot answer.
 *
 * Avoid the product name where a sentence can say "we" instead. It is inlined
 * in 18 user-facing strings with no APP_NAME constant (see BACKLOG.md); these
 * titles no longer add to that count.
 */
/**
 * ORDER (owner, 2026-08-27): Home → Tasks → Items → Ask → Settings.
 *
 * Tasks before Items because the tour is selling the payoff before the chore.
 * "Here is what your house needs" lands harder than "here is where you file
 * appliances", and Items reads as the way to get more of the first rather than
 * as data entry for its own sake.
 */
export const tourSteps: TourStep[] = [
  {
    /**
     * ONE Home step, not two (owner, 2026-08-27). It used to be a welcome
     * followed by a notifications explainer, both anchored to the same nav
     * button — so the tour appeared to stall on its first target, and the
     * highlight never moved between them.
     *
     * The notifications half is round 18's, and it is not decoration. The tour
     * taught NAVIGATION and never taught the thing a person needs before
     * trusting an app with their house: how it will reach them. That gap is
     * what produced HH-144 — reading "nothing here will remind you" over three
     * rows showing a weekly cadence, unable to tell whether the app was going
     * to do anything. Two channels, and only one of them is opt-in, so both
     * have to be said.
     *
     * It still deliberately does NOT ask for notification permission here.
     * Nothing is scheduled yet on a brand-new account, so the prompt would be
     * abstract — and iOS only ever shows it once.
     */
    element: "[data-tour='nav-home']",
    route: "/home",
    popover: {
      title: "Welcome",
      description:
        "Home is what your house needs from you, most important first — straight from your " +
        "manuals, not generic advice. It appears here on its own; notifications on your phone " +
        "are separate, and yours to allow.",
      side: "bottom",
      align: "start",
    },
  },
  {
    element: "[data-tour='nav-tasks']",
    route: "/maintenance",
    popover: {
      title: "Tasks",
      description:
        "Everything on a schedule — upkeep and cleaning alike — in one place. " +
        "Filter by priority, room, or status.",
      side: "bottom",
      align: "center",
    },
  },
  {
    element: "[data-tour='nav-inventory']",
    route: "/inventory",
    popover: {
      title: "Items",
      description:
        "Add anything you own that came with a manual. " +
        "We'll read it for the upkeep, the cleaning and the how-tos.",
      side: "bottom",
      align: "center",
    },
  },
  {
    element: "[data-tour='nav-ask']",
    route: "/chat",
    popover: {
      title: "Ask",
      description:
        "Why it's beeping, which filter it takes, how to reset it after a power cut — " +
        "ask anything about anything you own, and the answer comes straight out of that item's own manual.",
      side: "bottom",
      align: "center",
    },
  },
  {
    element: "[data-tour='nav-settings']",
    route: "/settings",
    popover: {
      title: "Settings",
      description:
        "Rooms, routines, when reminders arrive — and when they don't. " +
        "Rescan a manual here any time.",
      side: "top",
      align: "center",
    },
  },
]
