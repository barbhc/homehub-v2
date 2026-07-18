/**
 * discussTask core test — proves runDiscussTask loads the grounding set (task +
 * its manual chunk + home profile) into the model call and validates the
 * returned proposal against the allowed vocabulary. Uses a FIXTURE CallClaudeTool
 * (no Anthropic API / no cost); asserts on what the fixture received.
 *
 * Run: `npm run test:worker:emu`. Build lib first.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { getApps, initializeApp } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
import { runDiscussTask } from "../lib/firebase/functions/src/ai/discussTask.js"

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST must be set (run via emulators:exec)")
if (getApps().length === 0) initializeApp({ projectId: "demo-homehub" })
const db = getFirestore()

async function seed(H) {
  await db.doc(`homes/${H}`).set({ name: "H", homeType: "house", climate: "mild", freezeRisk: false })
  await db.doc(`homes/${H}/manuals/man1`).set({ itemUnitId: "item1", title: "Furnace Manual" })
  await db.doc(`homes/${H}/manuals/man1/chunks/ck1`).set({
    title: "Seasonal maintenance", content: "Inspect the outdoor vent terminals each heating season.",
    tags: ["seasonal"], sourcePages: [31], deletedAt: null,
  })
  await db.doc(`homes/${H}/taskTemplates/tpl1`).set({
    title: "Inspect vent terminations", justification: "Blocked vents can cause a CO hazard.",
    priorityTier: "essential", riskLevel: "safety", schedule: { scheduleType: "seasonal", season: "fall" },
    manualId: "man1", instructionsChunkId: "ck1", sourcePage: 31, deletedAt: null, isActive: true,
  })
}

test("runDiscussTask grounds on the task + manual chunk + profile, returns validated proposal", async () => {
  const H = "home-discuss"
  await seed(H)

  let seen = ""
  const fixtureTool = async ({ content }) => {
    seen = content.map((c) => c.text).join("\n")
    return { explanation: "It guards against a CO hazard (manual p.31), but you can lower its priority.", proposal: { action: "tier_remap", toTier: "optional", rationale: "You've had it inspected recently." } }
  }

  const out = await runDiscussTask(fixtureTool, db, { homeId: H, taskTemplateId: "tpl1", question: "Can I make this less important?", history: [] })

  // Grounding reached the model.
  assert.match(seen, /Inspect vent terminations/, "task title in prompt")
  assert.match(seen, /outdoor vent terminals/, "manual chunk content in prompt")
  assert.match(seen, /"climate":"mild"/, "home profile in prompt")
  assert.match(seen, /Can I make this less important/, "user question in prompt")

  // Validated result.
  assert.match(out.explanation, /CO hazard/)
  assert.equal(out.proposal.action, "tier_remap")
  assert.equal(out.proposal.toTier, "optional")
})

test("runDiscussTask drops an invalid proposal (bad enum) to null", async () => {
  const H = "home-discuss2"
  await seed(H)
  const fixtureTool = async () => ({ explanation: "Here's the deal.", proposal: { action: "tier_remap", toTier: "critical", rationale: "x" } })
  const out = await runDiscussTask(fixtureTool, db, { homeId: H, taskTemplateId: "tpl1", question: "hi", history: [] })
  assert.equal(out.proposal, null, "invalid toTier → proposal rejected")
  assert.equal(out.explanation, "Here's the deal.")
})
