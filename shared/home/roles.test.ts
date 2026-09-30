import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import {
  DEFAULT_INVITE_ROLE,
  HOME_ROLES,
  OPEN_INVITE_ROLES,
  effectiveInviteRole,
  isHomeRole,
} from "./roles"

describe("effectiveInviteRole — what accepting an invite actually confers", () => {
  it("honours an open role whoever created the invite", () => {
    for (const role of OPEN_INVITE_ROLES) {
      expect(effectiveInviteRole(role, "member")).toBe(role)
      expect(effectiveInviteRole(role, undefined)).toBe(role)
    }
  })

  it("honours a privileged role only when the creator is an owner NOW", () => {
    expect(effectiveInviteRole("owner", "owner")).toBe("owner")
    expect(effectiveInviteRole("admin", "owner")).toBe("admin")
  })

  it("clamps a privileged role from a non-owner to the default — the self-made owner invite", () => {
    expect(effectiveInviteRole("owner", "member")).toBe(DEFAULT_INVITE_ROLE)
    expect(effectiveInviteRole("owner", "admin")).toBe(DEFAULT_INVITE_ROLE)
    expect(effectiveInviteRole("admin", "member")).toBe(DEFAULT_INVITE_ROLE)
  })

  it("clamps when the creator is gone (removed, or never a member)", () => {
    expect(effectiveInviteRole("owner", undefined)).toBe(DEFAULT_INVITE_ROLE)
    expect(effectiveInviteRole("owner", null)).toBe(DEFAULT_INVITE_ROLE)
  })

  it("never passes through an unknown or missing role, even from an owner", () => {
    expect(effectiveInviteRole("superuser", "owner")).toBe(DEFAULT_INVITE_ROLE)
    expect(effectiveInviteRole(undefined, "owner")).toBe(DEFAULT_INVITE_ROLE)
    expect(effectiveInviteRole({ role: "owner" }, "owner")).toBe(DEFAULT_INVITE_ROLE)
  })

  it("the default is itself an open role (a clamp can never grant power)", () => {
    expect((OPEN_INVITE_ROLES as readonly string[]).includes(DEFAULT_INVITE_ROLE)).toBe(true)
    expect(isHomeRole(DEFAULT_INVITE_ROLE)).toBe(true)
  })

  it("owner and admin are not open roles", () => {
    expect(OPEN_INVITE_ROLES as readonly string[]).not.toContain("owner")
    expect(OPEN_INVITE_ROLES as readonly string[]).not.toContain("admin")
  })
})

/**
 * firestore.rules cannot import this module, so it restates both lists as
 * literals. If someone edits one side only, the rules and the accept callable
 * disagree about who may mint what — and the rules are the half that fails
 * silently (an invite the UI offers is simply refused in production).
 */
describe("firestore.rules carries the same role lists", () => {
  const rules = readFileSync(resolve(__dirname, "../../firestore.rules"), "utf8")
  const literal = (roles: readonly string[]) => `[${roles.map((r) => `'${r}'`).join(", ")}]`

  it("openInviteRole() matches OPEN_INVITE_ROLES", () => {
    expect(rules).toMatch(/function openInviteRole\(role\) \{\s*return role in \[[^\]]*\];/)
    expect(rules).toContain(`function openInviteRole(role) {\n      return role in ${literal(OPEN_INVITE_ROLES)};`)
  })

  it("homeRole() matches HOME_ROLES", () => {
    expect(rules).toContain(`function homeRole(role) {\n      return role in ${literal(HOME_ROLES)};`)
  })
})
