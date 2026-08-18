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

export const tourSteps: TourStep[] = [
  {
    element: "[data-tour='nav-home']",
    route: "/home",
    popover: {
      title: "Welcome to Homehub!",
      description:
        "This is your dashboard. See what tasks are due today, this week, and beyond.",
      side: "bottom",
      align: "start",
    },
  },
  {
    element: "[data-tour='nav-inventory']",
    route: "/inventory",
    popover: {
      title: "Your Inventory",
      description:
        "Add your appliances and upload their manuals. We'll extract maintenance tasks automatically.",
      side: "bottom",
      align: "center",
    },
  },
  {
    element: "[data-tour='nav-tasks']",
    route: "/maintenance",
    popover: {
      title: "Maintenance Tasks",
      description:
        "All your maintenance tasks in one place. Filter by priority, room, or status.",
      side: "bottom",
      align: "center",
    },
  },
  {
    element: "[data-tour='nav-ask']",
    route: "/chat",
    popover: {
      title: "Ask About Your Home",
      description:
        "Have a question about an appliance? Ask here and get answers from your manuals.",
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
        "Manage your rooms, create custom routines, and rescan manuals.",
      side: "top",
      align: "center",
    },
  },
]
