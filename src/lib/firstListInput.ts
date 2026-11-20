/**
 * What the first-minute list (shared/care/firstList.ts) needs about a home,
 * from its profile. Shared by onboarding (FirstMinute) and Home's monthly
 * refresh (design/day-one-home.md, release D), so both ask the same question
 * of the same facts.
 */
import type { HomeProfile, HomeType } from "@/modules/home/services/homeProfileService"
import { buildingHandlesByDefault } from "@/modules/home/components/onboardingOptions"
import type { FirstListInput } from "../../shared/care/firstList"
import type { CareFacts } from "../../shared/care/library"
import type { Hazard } from "../../shared/area/zipArea"
import { localToday } from "../../shared/dates/calendar"

/** Onboarding's in-screen corrections: none, for the monthly refresh. */
export interface Corrections { freeze: boolean | null; hazardsOff: Hazard[] }
export const NO_CORRECTIONS: Corrections = { freeze: null, hazardsOff: [] }

export function listInput(profile: HomeProfile | null, homeType: HomeType | null, c: Corrections, answers: CareFacts, month: number = Number(localToday().slice(5, 7))): FirstListInput {
  const facts: CareFacts = { ...(profile?.care_facts ?? {}), ...answers }
  if (buildingHandlesByDefault(homeType) && facts.building_handles_exterior === undefined) facts.building_handles_exterior = true
  const freeze = c.freeze ?? profile?.freeze_risk ?? null
  return {
    month,
    climate: profile?.climate ?? null,
    freezeRisk: freeze,
    homeType,
    hazards: (profile?.area?.hazards ?? []).filter((h) => !c.hazardsOff.includes(h)),
    facts,
    derived: {
      freezeRisk: c.freeze === null && profile?.climate_source === "zip",
      buildingHandlesExterior: buildingHandlesByDefault(homeType) && profile?.care_facts?.building_handles_exterior === undefined,
    },
    hasArea: !!profile?.area,
    observesDst: profile?.area?.observesDst ?? null,
  }
}

