/**
 * The review's two steps must be one design.
 *
 * HH-140, and the reason six rounds of redesign never reached it. Rounds 10–16
 * all reshaped the consolidated maintenance view — step 2, the screen every
 * report was taken on. Step 1, behind "Review them all", kept the pre-round-10
 * look: emoji section markers, two competing filled primaries, a bare ✕ next to
 * a hollow priority dot ("◦ ×" in the owner's screenshot), and "Save all 8"
 * under a line saying nothing needs a schedule.
 *
 * The mechanism was ONE map with three of six keys in it. Both steps iterate
 * REVIEW_BUCKET_ORDER over REVIEW_BUCKET_COPY and ask TIER_RAIL for a colour;
 * a bucket with no rail falls through to `copy.icon`. Step 2 renders only the
 * three tier buckets, so it never took the fallback. Step 1 renders all six, so
 * half its sections did.
 *
 * That is why the first test here is the one that matters: it is not about
 * pixels, it is the invariant that a bucket cannot exist without a rail. Adding
 * a seventh bucket without a colour would silently reintroduce the emoji look
 * on exactly one of the two doors, which is precisely how this started.
 */
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { TaskReviewSheet, TIER_RAIL } from "./TaskReviewSheet"
import { REVIEW_BUCKET_ORDER, REVIEW_BUCKET_COPY } from "../../../shared/tasks/reviewBuckets"
import type { PreviewResult, PreviewTask } from "@/modules/knowledge/types/previewTypes"

const task = (
  title: string,
  care_type: PreviewTask["care_type"],
  schedule_type: PreviewTask["schedule_type"],
  priority_tier: PreviewTask["priority_tier"] = "recommended",
): PreviewTask => ({
  title, description: null, care_type, priority_tier, risk_level: "performance",
  estimated_minutes: 10, schedule_type, interval_days: null,
  instructions_text: null, symptom_tags: [], re_check_triggers: [],
})

/** One row in every bucket, so all six sections render at once. */
const ALL_SIX: PreviewResult = {
  ok: true,
  chunks: [],
  tasks: [
    task("Replace the HEPA filter", "maintenance", "annual", "essential"),
    task("Vacuum the coils", "maintenance", "quarterly", "recommended"),
    task("Check the door seal", "maintenance", "annual", "optional"),
    task("Descale when the light comes on", "maintenance", "as_needed", "essential"),
    task("Verify proper grounding", "maintenance", "setup"),
    task("Wipe the vent after each use", "cleaning", "after_each_use"),
  ],
}

/** focus="all" is what "Review them all" opens — step 1. */
function renderStepOne(data: PreviewResult = ALL_SIX) {
  render(
    <TaskReviewSheet
      open onOpenChange={vi.fn()} itemName="Sharp SMD2470ASY24"
      previewData={data} onSave={vi.fn().mockResolvedValue(null)} saving={false}
      focus="all"
    />,
  )
}

describe("the invariant that broke", () => {
  it("gives every bucket a rail colour — no bucket can fall back to an emoji", () => {
    for (const bucket of REVIEW_BUCKET_ORDER) {
      expect(TIER_RAIL[bucket], `${bucket} has no rail — step 1 renders its emoji`).toBeTruthy()
    }
  })
})

describe("step 1 wears step 2's design", () => {
  it("heads its sections with the bucket titles, not their emoji", () => {
    renderStepOne()
    for (const bucket of REVIEW_BUCKET_ORDER) {
      const { title, icon } = REVIEW_BUCKET_COPY[bucket]
      // Setup arrives collapsed (HH-85), but its heading is always present.
      expect(screen.queryAllByText(title).length, title).toBeGreaterThan(0)
      expect(screen.queryByText(icon), `${title} still renders ${icon}`).toBeNull()
    }
  })

  it("drops the schedule bands that step 2 never had", () => {
    renderStepOne()
    // Each section's own sub-line already says whether it is scheduled.
    expect(screen.queryByText("On your schedule")).toBeNull()
    expect(screen.queryByText("Not scheduled")).toBeNull()
  })

  it("gives the remove control a name instead of a bare glyph", () => {
    renderStepOne()
    expect(screen.getByRole("button", { name: /Skip Replace the HEPA filter/ })).toBeTruthy()
    expect(screen.queryByText("✕")).toBeNull()
  })

  it("keeps exactly one filled primary — the footer's", () => {
    renderStepOne()
    const filled = Array.from(document.querySelectorAll("button")).filter((b) =>
      /(^|\s)bg-primary(\s|$)/.test(b.className))
    expect(filled.length, filled.map((b) => b.textContent).join(" | ")).toBe(1)
    expect(screen.getByRole("button", { name: /Go through them one by one/ }).className)
      .not.toMatch(/bg-primary/)
  })
})

describe("nothing to schedule, reached through step 1", () => {
  const NOTHING: PreviewResult = {
    ok: true,
    chunks: [],
    // `nothingToSchedule` is focus-aware: at focus="all" — which is what step 1
    // IS — a monthly cleaning row counts as scheduled, so the fixture step 2's
    // suite uses would not reach this branch here. Nothing scheduled at all.
    tasks: [
      task("Verify proper grounding", "maintenance", "setup"),
      task("Descale when the light comes on", "maintenance", "as_needed", "essential"),
      task("Wipe vent area after use", "cleaning", "after_each_use"),
    ],
  }

  it("leads with the finding, the way step 2 does", () => {
    renderStepOne(NOTHING)
    // HH-137's sentence, her wording, now on both doors.
    expect(screen.getByText(/No maintenance tasks found/)).toBeTruthy()
    // Scoped to the lead-in: Essential's empty-section line ends in the same
    // clause, and matching that instead would pass with no lead-in at all.
    expect(screen.getByText(/setup steps and tips, so nothing here will remind you/)).toBeTruthy()
  })

  it("does not claim the rows are saved while offering the Save", () => {
    renderStepOne(NOTHING)
    // HH-134's rule, which step 1 was never held to.
    expect(screen.queryByText(/They’re saved to this item/)).toBeNull()
    expect(screen.getByRole("button", { name: /Save/ })).toBeTruthy()
  })
})
