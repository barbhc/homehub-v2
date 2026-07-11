import type { DriveStep } from "driver.js"

export const tourSteps: DriveStep[] = [
  {
    element: "[data-tour='nav-home']",
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
    popover: {
      title: "Settings",
      description:
        "Manage your rooms, create custom routines, and rescan manuals.",
      side: "top",
      align: "center",
    },
  },
]
