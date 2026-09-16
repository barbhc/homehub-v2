/**
 * The item page's manual section is one of three doors into the task review,
 * and it was the one that never told the review whether the home freezes.
 *
 * Found 2026-08-30 with the code open: `TaskReviewSheet` defaulted
 * `freezeRiskFalse` to false, `ReviewItemTasksButton` and `ParsePickupCard`
 * passed the profile's answer, this door passed nothing. The server applies the
 * same suppression at save, so on this door a freeze-free home was shown
 * winterizing tasks in the review that then vanished on saving — the exact
 * "shown in review, gone after saving" report, still live on one door.
 *
 * The prop is required now, so a door that forgets fails to compile; this test
 * pins that THIS door answers from the profile rather than a literal.
 */
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import type { PreviewResult } from "@/modules/knowledge"

let freezeRisk: boolean | null = null
vi.mock("@/modules/home", () => ({
  useHomeProfile: () => ({ profile: { freeze_risk: freezeRisk }, isLoading: false, error: undefined, refresh: vi.fn() }),
}))
vi.mock("@/hooks/useManualManagement", () => ({
  useManualUrls: () => ({}),
  isDeadLegacyManualUrl: () => false,
}))
vi.mock("@/modules/knowledge", () => ({ updateManualLabel: vi.fn() }))
vi.mock("@/modules/knowledge/services/parseFeedbackService", () => ({ recordParseFeedback: vi.fn() }))

import { ManualSection } from "./ManualSection"

const task = (over: Record<string, unknown> = {}) => ({
  title: "Clean the Filter System", description: "", justification: null,
  care_type: "maintenance", priority_tier: "essential", risk_level: "prevent_damage",
  estimated_minutes: 10, schedule_type: "quarterly", interval_days: null,
  instructions_text: "", source_page: 1, tags: [], ...over,
})
const draft = {
  tasks: [task(), task({ title: "Winterize the Dishwasher", schedule_type: "seasonal" })],
  chunks: [], cleaning_guide: null, warranty: null,
} as unknown as PreviewResult

function renderDoor() {
  const noop = vi.fn()
  return render(
    <ManualSection
      homeId="home-1"
      itemName="Bosch SHPM65Z55N/01"
      manuals={[]}
      onManualUpdated={noop}
      addManualOpen={false} setAddManualOpen={noop}
      addMode="url" setAddMode={noop}
      addRole="primary" setAddRole={noop}
      urlInput="" setUrlInput={noop}
      titleInput="" setTitleInput={noop}
      labelInput="" setLabelInput={noop}
      setUploadFile={noop}
      addError={null} setAddError={noop}
      addLoading={false}
      parsePhase={false}
      setManualParseError={noop}
      parsingManualId={null}
      parsedManualId="manual-1" setParsedManualId={noop}
      previewResult={draft} setPreviewResult={noop}
      reviewOpen setReviewOpen={noop}
      saving={false}
      deletingManualId={null}
      handleOpenAddManual={noop} handleAddManual={noop}
      handleParseExistingManual={noop} handleRescanManual={noop} handleFillGaps={noop}
      handleDeleteManual={noop}
      handleSave={vi.fn().mockResolvedValue(null)}
    />,
  )
}

describe("ManualSection — the review door answers from the home profile", () => {
  it("a freeze-free home is not shown freeze prep the server would drop at save", () => {
    freezeRisk = false
    renderDoor()
    expect(screen.getByText(/Clean the Filter System/)).toBeInTheDocument()
    expect(screen.queryByText(/Winterize/)).toBeNull()
  })

  it("a home that freezes still sees its winterizing task", () => {
    freezeRisk = true
    renderDoor()
    expect(screen.getByText(/Winterize the Dishwasher/)).toBeInTheDocument()
  })

  it("an unanswered profile never suppresses anything", () => {
    freezeRisk = null
    renderDoor()
    expect(screen.getByText(/Winterize the Dishwasher/)).toBeInTheDocument()
  })
})
