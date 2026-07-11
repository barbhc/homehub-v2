# Legacy E2E specs (quarantined)

These specs predate the redesign (written ~2026-06-18) and assert UI that the
redesign removed or changed — e.g. `grid-cols-3` dashboard stats, tier chips
with `aria-pressed`, a "rooms"/"feature tour" settings layout, the
`/troubleshoot` → `/chat` redirect, and "ask your home anything" copy. They had
never run in CI (no seeded test user existed before).

They're **excluded from the suite** via `testIgnore: ["**/legacy/**"]` in
`playwright.config.ts`, and superseded by the current redesign suites:

| Legacy spec | Replaced by |
|---|---|
| dashboard.spec | `visual/pages` (home) + `a11y` (home) |
| navigation.spec | nav is exercised across every `visual`/`flows` spec |
| chat.spec | `visual`/`a11y` (ask) + `flows` (Ask cited answer) |
| inventory.spec | `visual`/`a11y` (items) |
| item-detail.spec | `visual` (item detail) + `flows` (Item specs) |
| maintenance.spec | `visual`/`a11y` (tasks) + `flows` (Tasks binding) |
| troubleshoot.spec | `flows` (Ask) |

Resurrect any of these by updating its selectors to the redesigned UI and moving
it back up to `e2e/`.
