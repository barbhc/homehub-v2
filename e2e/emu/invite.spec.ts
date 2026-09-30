import { test, expect } from "@playwright/test"

/**
 * Settings → Home Members → Invite, end to end under the real rules.
 *
 * firestore.rules refuses an invite unless its role is one the caller may hand
 * out (member/guest for any member; owner/admin only for an owner) and its
 * createdBy is the caller — and nobody may edit an invite afterwards. The one
 * real caller is HomeMembersSection → createInvite, which used to default to
 * role "admin". This drives the button and checks both halves: the invite
 * lands (a pending row, no error), and what it carries.
 *
 * The seeded user is the home's OWNER, so this proves the happy path the rules
 * must keep open; the refusals are pinned in firebase/rules.test.ts.
 */

const FIRESTORE = process.env.FIRESTORE_EMULATOR_HOST
  ?? `127.0.0.1:${process.env.VITE_EMULATOR_FIRESTORE_PORT ?? "8080"}`
const DOCS = `http://${FIRESTORE}/v1/projects/demo-homehub/databases/(default)/documents`

type RestDoc = { name: string; fields?: Record<string, { stringValue?: string; nullValue?: null }> }
async function invitesInSeedHome(): Promise<RestDoc[]> {
  const res = await fetch(`${DOCS}/homes/e2e-home/invites`, { headers: { Authorization: "Bearer owner" } })
  expect(res.ok, `listing invites: HTTP ${res.status}`).toBe(true)
  return ((await res.json()) as { documents?: RestDoc[] }).documents ?? []
}
async function seededOwnerUid(): Promise<string> {
  const res = await fetch(`${DOCS}/homes/e2e-home/members`, { headers: { Authorization: "Bearer owner" } })
  const docs = ((await res.json()) as { documents?: RestDoc[] }).documents ?? []
  const owner = docs.find((d) => d.fields?.role?.stringValue === "owner")
  expect(owner, "seeded owner row").toBeTruthy()
  return owner!.fields!.uid!.stringValue!
}

test.describe("emulator e2e — invites under the role rules", () => {
  test("the Invite button creates a member-role invite, signed by the caller", async ({ page, context }) => {
    // The handler auto-copies the link; without this a headless clipboard
    // refusal shows its (harmless) "copying failed" note instead.
    await context.grantPermissions(["clipboard-read", "clipboard-write"])
    const before = new Set((await invitesInSeedHome()).map((d) => d.name))

    await page.goto("/settings")
    const section = page.locator("#members")
    await expect(section.getByText("Home Members")).toBeVisible({ timeout: 20_000 })
    await section.getByRole("button", { name: /^invite$/i }).click()

    // Landed: a pending invite row, and no error in the section.
    await expect(section.getByText(/Invite link · expires in/).first()).toBeVisible({ timeout: 15_000 })
    await expect(section.getByRole("alert")).toHaveCount(0)

    const created = (await invitesInSeedHome()).filter((d) => !before.has(d.name))
    expect(created).toHaveLength(1)
    expect(created[0].fields?.role?.stringValue).toBe("member")
    expect(created[0].fields?.createdBy?.stringValue).toBe(await seededOwnerUid())
  })
})
