import { test, expect, type Page } from "@playwright/test"

/**
 * Home feed against the seeded emulator — proves the dashboard reads the
 * denormalized taskInstances end-to-end (Home's one list, design/home-focus.md). Secondary surfaces (warranties/notices/upkeep) are on
 * the inert shim for now, so they render empty rather than crashing the page.
 */
const visible = { visible: true } as const

/**
 * Every Firestore READ the page puts on the wire, one entry per read.
 *
 * With the default memory cache, getDocs() and getDoc() each register a LISTEN
 * TARGET on the WebChannel (`…/Listen/channel`, POSTed as `reqN___data__` form
 * fields holding `{ addTarget: … }`), so counting addTarget messages counts the
 * queries and document gets — one per call, however many documents it returns.
 * One-shot RPCs (runQuery / runAggregationQuery / batchGet) are counted too, so
 * a switch to one of those could not hide a read from the budget below.
 */
function trackFirestoreReads(page: Page): () => string[] {
  const reads: string[] = []
  page.on("request", (req) => {
    const url = req.url()
    if (req.method() !== "POST" || !url.includes("google.firestore.v1.Firestore")) return
    if (/:(runQuery|runAggregationQuery|batchGet)\b/.test(url)) {
      reads.push(`rpc ${url.split("/").pop()?.split("?")[0] ?? url}`)
      return
    }
    if (!url.includes("/Listen/channel")) return
    for (const [key, value] of new URLSearchParams(req.postData() ?? "")) {
      if (!/^req\d+___data__$/.test(key)) continue
      const msg = JSON.parse(value) as { addTarget?: Record<string, unknown> }
      if (msg.addTarget) reads.push(describeTarget(msg.addTarget))
    }
  })
  return () => [...reads]
}

/** "query taskInstances [status,deletedAt]" / "get homes/…" — enough to tell which read is which. */
function describeTarget(target: Record<string, unknown>): string {
  const docs = (target.documents as { documents?: string[] } | undefined)?.documents
  if (docs?.length) return `get ${docs[0].split("/documents/")[1] ?? docs[0]}`
  const q = target.query as { structuredQuery?: { from?: Array<{ collectionId?: string }>; where?: unknown } } | undefined
  const coll = q?.structuredQuery?.from?.[0]?.collectionId ?? "?"
  const fields = [...JSON.stringify(q?.structuredQuery?.where ?? {}).matchAll(/"fieldPath":"([^"]+)"/g)].map((m) => m[1])
  return `query ${coll}${fields.length ? ` [${fields.join(",")}]` : ""}`
}

/** Waits until no new read has gone out for `quietMs` (the channel's long GET never goes idle). */
async function settle(page: Page, reads: () => string[], quietMs = 2_500): Promise<void> {
  let last = -1
  let stableSince = Date.now()
  for (;;) {
    const n = reads().length
    if (n !== last) {
      last = n
      stableSince = Date.now()
    }
    if (Date.now() - stableSince >= quietMs) return
    await page.waitForTimeout(250)
  }
}

test.describe("emulator e2e — home feed", () => {
  test("Home renders seeded tasks (the dashboard end-to-end)", async ({ page }) => {
    await page.goto("/home")
    await expect(page).toHaveURL(/\/home/)
    // A seeded essential surfaces in the Home feed (hero or Upcoming).
    await expect(page.getByText("Replace HVAC furnace filter").filter(visible)).toBeVisible({ timeout: 20_000 })
    // The page did not crash on the still-shimmed secondary loaders.
    await expect(page.getByText(/Failed to load|Something went wrong/i)).toHaveCount(0)
  })

  test("the first task is open on arrival, and See details reaches its real detail (getTaskDetail end-to-end)", async ({ page }) => {
    await page.goto("/home")
    // Home, focused: the week's first task opens by default; its "See details"
    // is the one door to the full view.
    await expect(page.getByText("Replace HVAC furnace filter").filter(visible)).toBeVisible({ timeout: 20_000 })
    const open = page.locator('[data-testid="week-row"][data-open="true"]').filter(visible).first()
    await expect(open).toBeVisible()
    await open.getByRole("link", { name: /See details/ }).click()
    // The template's justification (why-it-matters) renders only after
    // getTaskDetail resolves the taskInstance → taskTemplate read.
    await expect(
      page.getByText(/clogged filter strains the blower/i).filter(visible)
    ).toBeVisible({ timeout: 10_000 })
  })

  test("a successful dashboard fetch persists a warm-start snapshot", async ({ page }) => {
    // Covers the wiring only: useDashboard's onSuccess writes the snapshot that
    // App feeds back as SWR `fallback`, and a reload still renders. It does NOT
    // prove the warm cache is what painted — against a local emulator the cold
    // fetch is fast enough that a broken gate would still render in time. The
    // gate invariant itself is unit-tested in src/lib/homeLoadingGate.test.ts.
    await page.goto("/home")
    await expect(page.getByText("Replace HVAC furnace filter").filter(visible)).toBeVisible({ timeout: 20_000 })

    const persisted = await page.evaluate(() => localStorage.getItem("hh-swr-dashboard-cache"))
    expect(persisted, "a successful dashboard fetch must persist a snapshot").not.toBeNull()
    expect(persisted).toContain("dashboard:")

    await page.reload()
    await expect(page.getByText("Replace HVAC furnace filter").filter(visible)).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/Failed to load|Something went wrong/i)).toHaveCount(0)
  })

  test("a cold Home load stays inside its Firestore read budget", async ({ page }) => {
    // Measured on this seed (2026-09-30), whole page, reads on the wire:
    //   before (whole-collection reads): 19, or 22 on the first load after the
    //     seed (the cleaning fallback starts the washer's missing instance);
    //   after (src/lib/homeReads.ts): 15, or 18 on that first load.
    // The dashboard's own share went from 8 targets — items ×2 plus an
    // unfiltered items read, taskTemplates ×2, every taskInstance twice (once
    // with done history, once unfiltered) and every done row — to 4.
    const reads = trackFirestoreReads(page)
    await page.goto("/home")
    await expect(page.getByText("Replace HVAC furnace filter").filter(visible)).toBeVisible({ timeout: 20_000 })
    await settle(page, reads)

    const all = reads()
    const log = `${all.length} Firestore reads:\n  ${all.join("\n  ")}`
    console.log(`[home read budget] ${log}`)
    expect(all.length, "the tracker must see the channel, or this test proves nothing").toBeGreaterThan(0)
    const exactly = (read: string) => all.filter((r) => r === read).length
    const count = (prefix: string) => all.filter((r) => r === prefix || r.startsWith(`${prefix} `)).length

    // No whole-collection read of instances or items, and each collection once.
    expect(exactly("query taskInstances"), log).toBe(0)
    expect(exactly("query items"), log).toBe(0)
    expect(count("query items"), log).toBe(1)
    expect(count("query taskTemplates"), log).toBe(1)
    expect(exactly("query taskInstances [status,deletedAt]"), log).toBe(1)
    // Done history is a bounded window, not every done row the home has.
    expect(exactly("query taskInstances [completedAt]"), log).toBe(1)
    expect(exactly("query taskInstances [status]"), log).toBe(0)
    // And the page as a whole: below the old steady state, with room for the
    // one first-load-after-seed instance start.
    expect(all.length, log).toBeLessThanOrEqual(18)
  })
})
