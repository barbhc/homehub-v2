# The task card

Owner-approved 2026-11-21 ("yes I approve this everywhere"). Mock with ten cases:
https://claude.ai/artifact/YYnjqdE9ZLfHxH5i7hvR65#card

## Order, everywhere a task is shown

1. **Status line** (Footnote 13/18 semibold): the tier as a word in its colour
   (Essential clay, Recommended teal, Optional slate), then the timing.
2. **Title** (Headline 17/22 in lists; larger on the task page).
3. **Item and minutes** as one line of text ("Carrier Infinity Furnace · 10 min").
4. **Supply**, when the task has one ("You'll need a 16 × 25 × 1 filter."), or who
   to book for pro work ("Schedule a visit with a technician."). Its place, when
   recorded, under it.
5. **Mark done and Snooze**, the same size side by side: Mark done filled, Snooze
   outlined (HIG: "buttons offered as a set share one size"; "use style, not
   size, to distinguish the preferred choice"). They stack under Larger Text.

A slot with nothing in it is left out. There is never a placeholder.

## Timing colour (`src/lib/taskCard.ts` `whenTone`)

| Timing | Colour | Why |
|---|---|---|
| A window: "Good to do now", "This week", "In Sep", "Been a while" | grey | most tasks have a window; colouring it invents urgency |
| A real date: "By Dec 5", "Sat, Jun 27", "Today" | ink | a date someone set should stand out |
| A passed deadline, or lapsed safety work | clay | the only real "attention" state; never red |

## Lists

Rows show the status line, title and item. Tapping a row opens it in place into
the card's lower half (minutes, supply, actions); its arrow opens the task's page.
Steps and the "why" live on the task's page only, so a list never shows steps
(this also keeps hazardous steps out of lists entirely).

No pills for timing, cadence or minutes: only the buttons look like buttons.

## Where

- Home "This week" (`ThisWeekList.tsx`)
- Tasks, phone (`RefinedWeek.tsx`) and desktop (`DesktopTasks.tsx`)
- The task page header (`RefinedTaskDetail.tsx`): status line and item line
- Parts: `src/components/tasks/TaskCard.tsx`

Not yet: the item page's task list (it edits cadence per task, a different job)
and "Your week" (proposed for removal).
