import { describe, it, expect } from "vitest"
import { classifyTaskActor, classifyTaskFields, stepsAllowedFor } from "./taskActor"
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

describe("classifyTaskFields — the one input every steps surface uses", () => {
  it("a hazard named only in a structured step still classifies hazardous", () => {
    expect(
      classifyTaskFields({
        title: "Restart the furnace after an outage",
        steps: ["Turn the gas valve to OFF and wait five minutes.", "Turn it back to ON."],
      }),
    ).toBe("hazardous")
    expect(classifyTaskFields({ title: "Restart the furnace after an outage" })).toBe("diy")
  })

  it("agrees with classifyTaskActor on the same template text", () => {
    const t = task({ title: "Inspect Limit Switch", instructions_override: "Check the rollout switch." })
    expect(classifyTaskFields({ title: "Inspect Limit Switch", instructions: "Check the rollout switch." })).toBe(classifyTaskActor(t))
  })

  it("steps are withheld only for hazardous work", () => {
    expect(stepsAllowedFor("hazardous")).toBe(false)
    expect(stepsAllowedFor("pro")).toBe(true)
    expect(stepsAllowedFor("diy")).toBe(true)
  })
})

// ── The title alone ─────────────────────────────────────────────────────────
// A row often carries nothing but its title. These are the common hazardous
// jobs a homeowner must never get DIY steps for, and the safe look-alikes the
// patterns must leave alone.
const HAZARDOUS_TITLES = [
  "Relight the gas furnace pilot",
  "Light the water heater pilot light",
  "Replace the thermocouple",
  "Clean the flame sensor",
  "Replace the hot surface igniter",
  "Inspect the furnace burners",
  "Adjust the boiler burner",
  "Clean the main burner",
  "Replace the gas valve",
  "Check the gas line for leaks",
  "What to do if you smell gas",
  "Inspect the gas supply connector",
  "Inspect the flue pipe for corrosion",
  "Reconnect the vent connector",
  "Combustion analysis and adjustment",
  "Check for spillage at the draft hood",
  "Replace the breaker panel",
  "Inspect the electrical panel for scorch marks",
  "Repair damaged wiring",
  "Replace a light switch",
  "Install a new outlet",
  "Recharge the A/C refrigerant",
  "Check refrigerant charge",
  "Test for carbon monoxide leaks",
  "Replace a circuit breaker",
  "Install a new breaker",
  "Replace the water heater heating element",
  "Hook up the gas dryer",
  "Replace the propane tank regulator",
  "Check the spillage switch on the draft diverter",
  "Vent the CO outdoors before re-entering",
]
const SAFE_TITLES = [
  "Clean the gas range grates",
  "Wipe the furnace cabinet",
  "Replace HVAC filter",
  "Test smoke detector",
  "Test the CO alarm",
  "Test carbon monoxide detector",
  "Reset a tripped breaker",
  "Test GFCI outlets",
  "Clean the refrigerator coils",
  "Clean the dryer lint trap",
  "Descale the coffee maker",
  "Check Vent System for Blockage",
  "Clean the range hood filter",
  "Flush the water heater tank",
  "Clean the dishwasher filter",
  "Clean the fireplace glass",
  "Replace the thermostat batteries",
  "Clean the gas grill grates",
  "Turn off power at the breaker panel, then clean the disposal",
  "Clean the range burner caps",
  // Review of #242: each of these painted the pro notice on a cleaning task.
  "Wipe up spillage under the dishwasher",
  "Clean up spillage in the oven cavity",
  "Replace the light bulb in the ceiling fan",
  "Replace the bulb in the light fixture",
  "Clean the propane grill grates",
  "Wipe down your natural gas range",
  "Descale the Breville Co. espresso machine",
  "Clean the gas burners on the cooktop",
  "Clean the grease filter. Warning: risk of fire or explosion if grease builds up.",
  "Dry the lint screen. Do not use near an open flame.",
  "Clean the oven heating element",
]

describe("classifyTaskFields — hazardous jobs by title alone", () => {
  it.each(HAZARDOUS_TITLES)("%s → hazardous", (title) => {
    expect(classifyTaskFields({ title })).toBe("hazardous")
  })
  it.each(SAFE_TITLES)("%s → not hazardous", (title) => {
    expect(classifyTaskFields({ title })).not.toBe("hazardous")
  })
})
