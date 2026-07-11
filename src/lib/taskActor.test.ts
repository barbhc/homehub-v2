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
