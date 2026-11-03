/**
 * The resume path, pinned by behaviour.
 *
 * `retiredDesigns.test.ts` guarded this by matching SOURCE TEXT — it asserted
 * that `wizardSession.ts` contained `RETIRED_STEPS.has(...) ? "manual"`, which
 * is to say it pinned the bug. A stored `purchase` step was resolved to
 * `"manual"` on read, so `SmartAddItem`'s branch for sending such a session to
 * the item page could never fire, and the one user who hits this — someone who
 * used the app before the rebuild, i.e. a beta tester — was dropped back on
 * "Add the manual" for an item whose manual was already attached.
 *
 * A text match cannot tell a rule from its inverse. These assertions can.
 * (Codex adversarial review 2026-10-29, findings 11 and 12.)
 */
import { describe, it, expect, beforeEach } from "vitest"
import {
  getWizardSession,
  setWizardSession,
  updateWizardSession,
  clearWizardSession,
  resumeTarget,
  PAST_THE_WIZARD,
  type WizardSession,
} from "./wizardSession"

const KEY = "homehub-smart-add-session"

/** A session as the wizard writes it, overridable per case. */
function session(over: Partial<WizardSession> = {}): WizardSession {
  return {
    itemId: "item-1",
    propertyId: "home-1",
    step: "manual",
    itemName: "Beer fridge",
    brand: "Bosch",
    model: "SHPM88",
    locationId: "kitchen",
    hasManual: true,
    hasTasks: false,
    createdAt: "2026-10-29T12:00:00.000Z",
    ...over,
  }
}

/** Write a raw object to storage — how a session from an OLDER build arrives. */
function store(raw: unknown) {
  localStorage.setItem(KEY, JSON.stringify(raw))
}

beforeEach(() => {
  clearWizardSession()
})

describe("a session the wizard has no screen for goes to the item, not back into the flow", () => {
  for (const step of PAST_THE_WIZARD) {
    it(`"${step}" resumes at the item page`, () => {
      store({ ...session(), step })
      const read = getWizardSession()
      expect(read?.resume).toEqual({ at: "item" })
    })
  }

  it("a step this build has never heard of resumes at the item page too", () => {
    // A session written by a newer build, or restored half-formed. This used to
    // be installed into React state as-is and rendered the wizard's header over
    // an empty screen.
    store({ ...session(), step: "details" })
    expect(getWizardSession()?.resume).toEqual({ at: "item" })
  })

  it("the read shape offers no step at all, so nobody can resolve one again", () => {
    store({ ...session(), step: "purchase" })
    const read = getWizardSession()
    expect(read).not.toBeNull()
    expect(read).not.toHaveProperty("step")
  })

  it("keeps the item id, which is what the item page needs", () => {
    store({ ...session({ itemId: "fridge-7" }), step: "plan" })
    expect(getWizardSession()?.itemId).toBe("fridge-7")
  })
})

describe("the two live steps resume where they left off", () => {
  it("identify", () => {
    setWizardSession(session({ step: "identify" }))
    expect(getWizardSession()?.resume).toEqual({ at: "step", step: "identify" })
  })

  it("manual", () => {
    setWizardSession(session({ step: "manual" }))
    expect(getWizardSession()?.resume).toEqual({ at: "step", step: "manual" })
  })
})

describe("resumeTarget is the one decision", () => {
  it("answers for a live step, a retired one and a missing one", () => {
    expect(resumeTarget("identify")).toEqual({ at: "step", step: "identify" })
    expect(resumeTarget("manual")).toEqual({ at: "step", step: "manual" })
    expect(resumeTarget("purchase")).toEqual({ at: "item" })
    expect(resumeTarget(undefined)).toEqual({ at: "item" })
    expect(resumeTarget(null)).toEqual({ at: "item" })
    expect(resumeTarget(7)).toEqual({ at: "item" })
  })
})

describe("stored JSON is read, not cast", () => {
  it("no session at all", () => {
    expect(getWizardSession()).toBeNull()
  })

  it("unparseable JSON starts fresh instead of throwing", () => {
    localStorage.setItem(KEY, "{not json")
    expect(getWizardSession()).toBeNull()
  })

  it("a non-object starts fresh", () => {
    store("just a string")
    expect(getWizardSession()).toBeNull()
  })

  /** The stored object minus one key — how a truncated or older session arrives. */
  function without(key: keyof WizardSession) {
    const raw: Record<string, unknown> = { ...session() }
    delete raw[key]
    return raw
  }

  it("no itemId is no session — there is nothing to resume", () => {
    store(without("itemId"))
    expect(getWizardSession()).toBeNull()
  })

  it("no propertyId is no session — the home it belongs to is unknown", () => {
    store(without("propertyId"))
    expect(getWizardSession()).toBeNull()
  })

  it("wrong-typed fields degrade instead of reaching the UI as themselves", () => {
    store({
      ...session(),
      itemName: 42,
      brand: { nope: true },
      hasManual: "yes",
      purchasePrice: "199",
      categoryFields: "not an object",
    })
    const read = getWizardSession()
    expect(read?.itemName).toBe("")
    expect(read?.brand).toBeNull()
    // "yes" is not true: a string must never read as a manual being attached.
    expect(read?.hasManual).toBe(false)
    expect(read?.purchasePrice).toBeNull()
    expect(read?.categoryFields).toEqual({})
  })

  it("NaN is not a price", () => {
    store({ ...session(), purchasePrice: Number.NaN })
    expect(getWizardSession()?.purchasePrice).toBeNull()
  })
})

describe("writing a session stores only what a session is", () => {
  it("a read session written back does not round-trip its resume target", () => {
    setWizardSession(session({ step: "manual" }))
    const read = getWizardSession()!
    setWizardSession({ ...read, step: "manual" })
    const raw = JSON.parse(localStorage.getItem(KEY)!)
    expect(raw).not.toHaveProperty("resume")
    expect(raw.step).toBe("manual")
  })

  it("optional fields are stored explicitly rather than left undefined", () => {
    setWizardSession(session())
    const raw = JSON.parse(localStorage.getItem(KEY)!)
    expect(raw.itemCategory).toBeNull()
    expect(raw.parseConfidence).toBeNull()
    expect(raw.categoryFields).toEqual({})
  })
})

describe("updating a session", () => {
  it("merges into what is stored", () => {
    setWizardSession(session({ hasManual: false }))
    updateWizardSession({ hasManual: true })
    expect(getWizardSession()?.hasManual).toBe(true)
  })

  it("on a past-the-wizard session, resolves the step forward rather than storing a deleted one", () => {
    store({ ...session(), step: "purchase" })
    updateWizardSession({ hasTasks: true })
    const raw = JSON.parse(localStorage.getItem(KEY)!)
    expect(raw.step).toBe("manual")
    expect(raw.hasTasks).toBe(true)
  })

  it("does nothing when there is no session", () => {
    updateWizardSession({ hasManual: true })
    expect(localStorage.getItem(KEY)).toBeNull()
  })
})
