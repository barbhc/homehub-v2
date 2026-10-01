/**
 * The review tells the truth about both channels — HH-161, frames S3b, S4, S5
 * of the approved mock (design/mocks/scan-indicator). Each `it` quotes the
 * "must be true" line it pins.
 *
 *  - "N will show up in Tasks" counts only what the Tasks page will list: it
 *    used to count every row with a cadence, so two cleaning jobs the Tasks
 *    page never shows made 6 read 8.
 *  - "M of those will also notify your phone" is the number of bells on screen,
 *    and a bell is drawn only where it can ring — never on item cleaning, never
 *    on a phone that refused notifications.
 *
 * Refined after the owner's review of #228 (2026-09-30): cleaning rows carry
 * no "Lives on the item page" line of their own (the Cleaning header says it);
 * a no-maintenance summary does not say "Cleaning, usage and setup stay on the
 * item page." beside "Nothing here goes into Tasks."; and a refused phone's
 * collapsed row says only "Reminders off" — "Turn on in Settings" is in the
 * opened row, beside the reminder switch.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom"
import { TaskReviewSheet } from "./TaskReviewSheet"
import type { PreviewResult, PreviewTask } from "@/modules/knowledge/types/previewTypes"
import { markFirstReviewSeen } from "@/lib/firstReview"

const t = (
  title: string, care_type: PreviewTask["care_type"], schedule_type: PreviewTask["schedule_type"],
  priority_tier: PreviewTask["priority_tier"] = "recommended",
): PreviewTask => ({
  title, description: null, care_type, priority_tier, risk_level: "performance", estimated_minutes: 10,
  schedule_type, interval_days: null, instructions_text: null, symptom_tags: [], re_check_triggers: [],
})

/** S4 / S5 — six maintenance rows with a cadence, one Essential; four cleaning
 *  rows, two with a cadence (one of them Essential); two setup steps. */
const BOSCH: PreviewResult = {
  ok: true, chunks: [],
  tasks: [
    t("Check the door seal", "maintenance", "annual", "essential"),
    t("Clean the filter", "maintenance", "monthly"),
    t("Descale", "maintenance", "quarterly"),
    t("Clean the spray arms", "maintenance", "semiannual"),
    t("Clean the drain pump", "maintenance", "annual", "optional"),
    t("Check the drain hose", "maintenance", "annual", "optional"),
    t("Clean the tub and door edges", "cleaning", "monthly", "essential"),
    t("Clean the cutlery basket", "cleaning", "monthly", "optional"),
    t("Wipe the door", "cleaning", "as_needed"),
    t("Wipe the panel", "cleaning", "as_needed", "optional"),
    t("Level the dishwasher", "maintenance", "setup"),
    t("Connect the drain", "maintenance", "setup"),
  ],
}

/** S3b — four cleaning (two with a cadence), two setup, no maintenance. */
const SHARP: PreviewResult = {
  ok: true, chunks: [],
  tasks: [
    t("Clean the waveguide cover", "cleaning", "monthly"),
    t("Wipe the drawer interior", "cleaning", "weekly", "optional"),
    t("Clean the door seals", "cleaning", "as_needed"),
    t("Wipe the control panel", "cleaning", "as_needed", "optional"),
    t("Verify the drawer is grounded", "maintenance", "setup", "essential"),
    t("Level the drawer front", "maintenance", "setup"),
  ],
}

function Where() {
  return <span data-testid="where">{useLocation().pathname + useLocation().hash}</span>
}

function Screen({ data, notificationsBlocked, onSave }: { data: PreviewResult; notificationsBlocked: boolean; onSave: () => Promise<string | null> }) {
  return (
    <MemoryRouter initialEntries={["/items/i1"]}>
      <Routes>
        <Route path="*" element={
          <>
            <Where />
            <TaskReviewSheet
              freezeRiskFalse={false}
              notificationsBlocked={notificationsBlocked}
              open
              onOpenChange={vi.fn()}
              itemName="Bosch dishwasher"
              previewData={data}
              saving={false}
              onSave={onSave}
            />
          </>
        } />
      </Routes>
    </MemoryRouter>
  )
}

function sheet(data: PreviewResult, notificationsBlocked: boolean, onSave = vi.fn().mockResolvedValue(null)) {
  const r = render(<Screen data={data} notificationsBlocked={notificationsBlocked} onSave={onSave} />)
  /** The same review, same state — only the phone's permission changes. */
  const permission = (blocked: boolean) => r.rerender(<Screen data={data} notificationsBlocked={blocked} onSave={onSave} />)
  return { ...r, onSave, permission }
}

/** The collapsed row that carries this title. */
const row = (title: string) => screen.getByText(title).closest("button") as HTMLElement
const bells = () => document.querySelectorAll("svg.lucide-bell-ring")
const anyBell = () => document.querySelectorAll("svg.lucide-bell-ring, svg.lucide-bell-off, svg.lucide-bell")
const sections = () =>
  screen.queryAllByText(/^(Maintenance|Cleaning|Usage|Setup)$/).map((el) =>
    Array.from(el.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join("").trim())

beforeEach(() => {
  localStorage.clear()
  // The steady-state screen, as the mock draws it; the first-run lines are
  // checked on their own below.
  markFirstReviewSeen()
})

describe("S4 — a count that matches Tasks", () => {
  it("S4.1 — '6 will show up in Tasks' counts only maintenance with a cadence; the two cleaning rows are not counted", () => {
    sheet(BOSCH, false)
    expect(screen.getByText("6 will show up in Tasks")).toBeInTheDocument()
    expect(screen.queryByText(/8 will show up in Tasks/)).toBeNull()
  })

  it("S4.2 — '1 of those will also notify your phone' matches the bells on screen: one, on the Essential row", () => {
    sheet(BOSCH, false)
    expect(screen.getByText("1 of those will also notify your phone.")).toBeInTheDocument()
    const rowBells = screen.getAllByLabelText("Notifies you")
    expect(rowBells).toHaveLength(1)
    expect(row("Check the door seal")).toContainElement(rowBells[0])
  })

  it("S4.3 — the Essential row shows 'Yearly' with the bell beside it, and every scheduled row's chip has the same style", () => {
    sheet(BOSCH, false)
    const essential = row("Check the door seal")
    const chip = within(essential).getByText("Yearly")
    expect(within(essential).getByLabelText("Notifies you")).toBeInTheDocument()
    const quietChip = within(row("Clean the filter")).getByText("Monthly")
    const cleaningChip = within(row("Clean the tub and door edges")).getByText("Monthly")
    expect(quietChip.className).toBe(chip.className)
    expect(cleaningChip.className).toBe(chip.className)
  })

  it("S4.4 — a cleaning row with a cadence never shows a bell, whatever its tier; the Cleaning header says where it lives, not the row", () => {
    sheet(BOSCH, false)
    for (const title of ["Clean the tub and door edges", "Clean the cutlery basket"]) {
      expect(within(row(title)).queryByLabelText("Notifies you")).toBeNull()
      // No per-row line (not rendered): the header already says it.
      expect(row(title).textContent).not.toMatch(/Lives on the item page/)
    }
    expect(screen.getByText("Keeps it nice. Lives on the item page.")).toBeInTheDocument()
    expect(screen.queryByText("Lives on the item page")).toBeNull()
  })

  it("S4.4 — opened, a cadenced cleaning row offers no reminder switch, and says why", () => {
    sheet(BOSCH, false)
    fireEvent.click(row("Clean the tub and door edges"))
    expect(screen.queryByRole("checkbox", { name: /Remind me when it/ })).toBeNull()
    expect(screen.getByText(/Cleaning lives on the item page — it never notifies you\./)).toBeInTheDocument()
  })

  it("S4.5 — the button saves every row the review lists: 'Save all 12'", () => {
    sheet(BOSCH, false)
    expect(screen.getByRole("button", { name: "Save all 12" })).toBeInTheDocument()
  })
})

describe("S3b — the no-maintenance review", () => {
  it("S3b.1 — one screen, Cleaning (4) then Setup (2): no Maintenance section, no sentence about its absence", () => {
    sheet(SHARP, false)
    expect(sections()).toEqual(["Cleaning", "Setup"])
    expect(document.body.textContent).not.toMatch(/no maintenance/i)
  })

  it("S3b.2 — 'Nothing here goes into Tasks.' and 'Nothing is saved until you press Save.', with no notify line", () => {
    sheet(SHARP, false)
    expect(screen.getByText("Nothing here goes into Tasks.")).toBeInTheDocument()
    expect(screen.getByText("Nothing is saved until you press Save.")).toBeInTheDocument()
    expect(screen.queryByText(/notify you|notify your phone/)).toBeNull()
  })

  it("S3b.2 — on a person's FIRST review too: no second sentence saying where cleaning lives (not rendered)", () => {
    localStorage.clear()
    sheet(SHARP, false)
    expect(screen.getByText("Nothing here goes into Tasks.")).toBeInTheDocument()
    expect(screen.getByText("Nothing is saved until you press Save.")).toBeInTheDocument()
    expect(screen.queryByText("Cleaning, usage and setup stay on the item page.")).toBeNull()
  })

  it("…while beside a count of what DOES go into Tasks, a first review still says where the rest lives", () => {
    localStorage.clear()
    sheet(BOSCH, false)
    expect(screen.getByText("6 will show up in Tasks")).toBeInTheDocument()
    expect(screen.getByText("Cleaning, usage and setup stay on the item page.")).toBeInTheDocument()
  })

  it("S3b.3 — zero bells: no bell icon of any kind on the screen", () => {
    sheet(SHARP, false)
    expect(anyBell()).toHaveLength(0)
  })

  it("S3b.3 — …on a person's FIRST review too, where the explainer lines show", () => {
    localStorage.clear()
    sheet(SHARP, false)
    expect(screen.getByText("What saving these does")).toBeInTheDocument()
    expect(anyBell()).toHaveLength(0)
  })

  it("S3b.4 — cadenced cleaning keeps its real cadence in the same chip, with no bell; the Cleaning header says where it lives; the others say 'when needed'", () => {
    sheet(SHARP, false)
    for (const [title, cadence] of [["Clean the waveguide cover", "Monthly"], ["Wipe the drawer interior", "Weekly"]]) {
      expect(within(row(title)).getByText(cadence)).toBeInTheDocument()
      expect(row(title).querySelector("svg.lucide-bell-ring, svg.lucide-bell-off, svg.lucide-bell")).toBeNull()
      expect(row(title).textContent).not.toMatch(/Lives on the item page/)
    }
    expect(screen.getByText("Keeps it nice. Lives on the item page.")).toBeInTheDocument()
    expect(within(row("Clean the door seals")).getByText("when needed")).toBeInTheDocument()
    expect(within(row("Wipe the control panel")).getByText("when needed")).toBeInTheDocument()
  })

  it("S3b.5 — 'Save all 6', and pressing it is the only thing that saves", async () => {
    const { onSave } = sheet(SHARP, false)
    expect(onSave).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Save all 6" }))
    expect(onSave).toHaveBeenCalledTimes(1)
    const [tasks] = onSave.mock.calls[0] as [PreviewTask[]]
    expect(tasks).toHaveLength(6)
  })
})

describe("S5 — notifications refused on this phone", () => {
  it("S5.1 — no bell renders anywhere in the review, even on the Essential row opened", () => {
    sheet(BOSCH, true)
    expect(bells()).toHaveLength(0)
    fireEvent.click(row("Check the door seal"))
    expect(bells()).toHaveLength(0)
  })

  it("S5.2 — the Essential row keeps its 'Yearly' chip and says 'Reminders off' under its title — a status, not a link", () => {
    sheet(BOSCH, true)
    const essential = row("Check the door seal")
    expect(within(essential).getByText("Yearly")).toBeInTheDocument()
    expect(within(essential).getByText("Reminders off")).toBeInTheDocument()
    // The collapsed row IS the button that opens it: nothing inside it may
    // lead away from the review (not rendered).
    expect(within(essential).queryByRole("link")).toBeNull()
    expect(essential.textContent).not.toMatch(/Settings/)
    // Only the row that would have rung says it.
    expect(row("Clean the filter").textContent).not.toContain("Reminders off")
    expect(row("Clean the tub and door edges").textContent).not.toContain("Reminders off")
  })

  it("S5.2 — tapping the collapsed row anywhere opens it, and never leaves the review", () => {
    sheet(BOSCH, true)
    fireEvent.click(within(row("Check the door seal")).getByText("Reminders off"))
    expect(screen.getByTestId("where").textContent).toBe("/items/i1")
    expect(screen.getByRole("checkbox", { name: /Remind me when it/ })).toBeInTheDocument()
  })

  it("S5.2 — opened, 'Turn on in Settings' sits beside the reminder switch and opens the app's Notifications section", () => {
    sheet(BOSCH, true)
    fireEvent.click(row("Check the door seal"))
    const toggle = screen.getByRole("checkbox", { name: /Remind me when it/ })
    const link = screen.getByRole("link", { name: "Turn on in Settings" })
    // Beside the switch: in the same reminder block.
    expect(toggle.closest("div")!.contains(link)).toBe(true)
    expect(link.closest("div")!.textContent).toContain("Reminders off — Turn on in Settings")
    fireEvent.click(link)
    expect(screen.getByTestId("where").textContent).toBe("/settings#notifications")
  })

  it("S5.3 — the Tasks line is unchanged; the second line is 'None will notify you. Notifications are off on this phone.' with a bell-off icon", () => {
    sheet(BOSCH, true)
    expect(screen.getByText("6 will show up in Tasks")).toBeInTheDocument()
    const line = screen.getByText("None will notify you. Notifications are off on this phone.")
    expect(line.parentElement!.querySelector("svg.lucide-bell-off")).not.toBeNull()
  })

  it("S5.4 — the row keeps the owner's choice: when permission returns, its bell returns, without another review", () => {
    const view = sheet(BOSCH, true)
    // A choice made while refused: turn a Recommended row's reminder ON. The
    // switch is still there — it records the choice — but no bell is drawn.
    fireEvent.click(row("Clean the filter"))
    fireEvent.click(screen.getByRole("checkbox", { name: /Remind me when it/ }))
    fireEvent.click(screen.getByRole("button", { name: "Done" }))
    expect(bells()).toHaveLength(0)
    expect(within(row("Clean the filter")).getByText("Reminders off")).toBeInTheDocument()

    // The phone says yes (the hook re-reads on return from Settings): the SAME
    // review now draws both bells — the default one and the one chosen.
    view.permission(false)
    expect(within(row("Check the door seal")).getByLabelText("Notifies you")).toBeInTheDocument()
    expect(within(row("Clean the filter")).getByLabelText("Notifies you")).toBeInTheDocument()
    expect(screen.getByText("2 of those will also notify your phone.")).toBeInTheDocument()
  })

  it("S5.4 — saving while refused keeps the Essential default (null), so the bell returns without another review", () => {
    const { onSave } = sheet(BOSCH, true)
    fireEvent.click(screen.getByRole("button", { name: "Save all 12" }))
    const [tasks] = onSave.mock.calls[0] as [PreviewTask[]]
    const doorSeal = tasks.find((x) => x.title === "Check the door seal") as PreviewTask & { remind_enabled?: boolean | null }
    expect(doorSeal.remind_enabled ?? null).toBeNull()
  })
})
