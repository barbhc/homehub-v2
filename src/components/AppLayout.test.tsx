/**
 * The app shell's navigation, after Clean and Warranties became views of Tasks
 * and Items (design/tasks-items-views.md): the desktop header no longer lists
 * them — at any level, including the highest, which is where they used to
 * appear — while the level-grown entry that remains (Providers) still does.
 */
import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"

vi.mock("@/components/manuals/ScanTray", () => ({
  ScanTrayProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ScanCountBadge: () => null,
}))
vi.mock("@/components/manuals/scanStatus", () => ({
  scanCount: () => ({ count: 0, label: "" }),
  useScanTray: () => ({}),
}))
vi.mock("@/modules/home", () => ({ useCurrentHome: () => ({ home: { home_id: "h1" } }) }))
vi.mock("@/modules/auth", () => ({ useAuth: () => ({ user: { id: "u1", email: "a@example.com" }, signOut: vi.fn() }) }))
vi.mock("@/hooks/useUserLevel", () => ({ useUserLevel: () => ({ level: "power" }) }))
vi.mock("@/hooks/useInterfaceLevelSync", () => ({ useInterfaceLevelSync: () => {} }))
vi.mock("@/lib/feedback", () => ({ openFeedback: vi.fn() }))

const { AppLayout } = await import("./AppLayout")

describe("AppLayout — navigation", () => {
  it("has no Clean or Warranties entry (not rendered), at the level that used to show both", () => {
    render(
      <MemoryRouter initialEntries={["/home"]}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/home" element={<div />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
    // The level-grown nav did render: Providers is there…
    expect(screen.getByRole("link", { name: "Providers" })).toHaveAttribute("href", "/providers")
    // …and Clean and Warranties are not in the DOM at all, under any name or address.
    expect(screen.queryAllByRole("link", { name: /^(Clean|Cleaning|Warranties)$/ })).toHaveLength(0)
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"))
    expect(hrefs).not.toContain("/clean")
    expect(hrefs).not.toContain("/warranties")
    // Tasks and Items — where they live now — are.
    expect(screen.getAllByRole("link", { name: "Tasks" }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole("link", { name: "Items" }).length).toBeGreaterThan(0)
  })
})
