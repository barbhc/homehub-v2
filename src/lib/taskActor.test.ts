import { describe, it, expect } from "vitest"
import { classifyTaskActor } from "./taskActor"
import type { TaskTemplateWithSchedule } from "@/modules/care"

/**
 * Safety-critical: a regression here would re-expose hazardous DIY steps
 * (e.g. "loosen the gas union until you smell gas") as homeowner checkboxes.
 * Uses the real York furnace tasks that drove this feature.
 */
function task(p: {
  title: string
  instructions_override?: string | null
  description?: string | null
  justification?: string | null
}): TaskTemplateWithSchedule {
  return {
    title: p.title,
    instructions_override: p.instructions_override ?? null,
    description: p.description ?? null,
    justification: p.justification ?? null,
  } as unknown as TaskTemplateWithSchedule
}

describe("classifyTaskActor", () => {
  it("flags gas piping / leak tasks as hazardous (never DIY)", () => {
    expect(
      classifyTaskActor(
        task({
          title: "Verify Gas Piping Connections and Check for Leaks",
          instructions_override: "Check all pipe joints and gas valve connections.",
        })
      )
    ).toBe("hazardous")
  })

  it("flags gas-pressure / combustion startup as hazardous", () => {
    expect(
      classifyTaskActor(
        task({
          title: "Perform Full System Startup",
          instructions_override: "Record gas pressures and BTU input using the gas meter.",
        })
      )
    ).toBe("hazardous")
  })

  it("flags manometer / static-pressure tasks as pro", () => {
    expect(
      classifyTaskActor(
        task({
          title: "Measure Temperature Rise and Static Pressures",
          instructions_override: "Connect a manometer to the static pressure taps.",
        })
      )
    ).toBe("pro")
  })

  it("flags limit/rollout switch and control-board tasks as pro", () => {
    expect(classifyTaskActor(task({ title: "Inspect Limit Switch and Rollout Switches" }))).toBe("pro")
    expect(
      classifyTaskActor(
        task({
          title: "Verify Proper Blower Operation",
          instructions_override: "Check blower speed tap connections on the control board.",
        })
      )
    ).toBe("pro")
  })

  // ── HH-152 (2026-09-05): the manual said "qualified technician", the row said DIY ──
  it("reads the manual's own 'by a qualified technician' as a pro task", () => {
    expect(
      classifyTaskActor(
        task({
          title: "Clean the Exhaust Duct",
          instructions_override:
            "Have the entire exhaust duct system cleaned by a qualified technician every 18 months.",
          justification: "Lint buildup in the duct restricts airflow and is a fire hazard.",
        })
      )
    ).toBe("pro")
  })

  it("reads 'hire / contact a professional' phrasing as pro, in any field", () => {
    expect(classifyTaskActor(task({
      title: "Clean the dryer ductwork",
      justification: "The manual says to hire a qualified technician to clean the ductwork.",
    }))).toBe("pro")
    expect(classifyTaskActor(task({
      title: "Annual tune-up",
      description: "Professional service is recommended once a year before the heating season.",
    }))).toBe("pro")
    expect(classifyTaskActor(task({
      title: "Inspect the sealed system",
      instructions_override: "The sealed refrigeration system is not user-serviceable.",
    }))).toBe("pro")
  })

  it("does NOT flip a homeowner task to pro over a troubleshooting fallback", () => {
    expect(classifyTaskActor(task({
      title: "Clean the lint filter",
      instructions_override:
        "Pull the lint screen out and roll the lint off with your fingers. If drying times increase, contact a qualified technician.",
    }))).toBe("diy")
    expect(classifyTaskActor(task({
      title: "Run a cleaning cycle",
      justification: "Keeps the drum fresh; should the odor persist, call a service technician.",
    }))).toBe("diy")
  })

  it("hazardous still wins over a pro directive", () => {
    expect(classifyTaskActor(task({
      title: "Check the gas line",
      instructions_override: "Have the gas line inspected by a licensed technician.",
    }))).toBe("hazardous")
  })

  it("leaves genuine homeowner tasks as diy", () => {
    expect(
      classifyTaskActor(
        task({
          title: "Replace or Clean Air Filter",
          instructions_override: "Slide the old filter out and insert a new one of the same size.",
        })
      )
    ).toBe("diy")
    expect(
      classifyTaskActor(
        task({
          title: "Check Vent System for Blockage",
          instructions_override: "Visually inspect the vent pipe for cracks or debris.",
        })
      )
    ).toBe("diy")
  })
})
