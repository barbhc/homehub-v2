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
    // Copy is a tap now (seventeen fixes: no automatic copy after create);
    // the permission lets the test read back what the tap put there.
    await context.grantPermissions(["clipboard-read", "clipboard-write"])
    const before = new Set((await invitesInSeedHome()).map((d) => d.name))

    await page.goto("/settings/members")
    const section = page.getByTestId("settings-pane-members")
    await expect(section.getByRole("heading", { level: 1, name: "Members" })).toBeVisible({ timeout: 20_000 })
    await section.getByRole("button", { name: /^invite$/i }).click()

    // Landed: a pending invite row, the ready line with the real expiry, and
    // no error — in particular no "copying the link failed" (rendered: 0).
    await expect(section.getByText(/Invite link · expires in/).first()).toBeVisible({ timeout: 15_000 })
    await expect(section.getByText("Invite link ready. It works for 7 days.")).toBeVisible()
    await expect(section.getByRole("alert")).toHaveCount(0)
    await expect(section.getByText(/copying the link failed/i)).toHaveCount(0)

    // m7: Share Link and Copy under the invite, the same size.
    const row = section.getByTestId("invite-row").first()
    const share = row.getByRole("button", { name: "Share Link" })
    const copy = row.getByRole("button", { name: "Copy" })
    await expect(share).toBeVisible()
    await expect(copy).toBeVisible()
    const [sb, cb] = [await share.boundingBox(), await copy.boundingBox()]
    expect(Math.round(sb!.width)).toBe(Math.round(cb!.width))
    expect(Math.round(sb!.height)).toBe(Math.round(cb!.height))

    const created = (await invitesInSeedHome()).filter((d) => !before.has(d.name))
    expect(created).toHaveLength(1)
    expect(created[0].fields?.role?.stringValue).toBe("member")
    expect(created[0].fields?.createdBy?.stringValue).toBe(await seededOwnerUid())

    // Copy puts THIS invite's link on the clipboard, and says Copied.
    const token = created[0].fields?.token?.stringValue
    expect(token, "the new invite's token").toBeTruthy()
    await copy.click()
    await expect(row.getByRole("button", { name: "Copied" })).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(token!)
  })
})
