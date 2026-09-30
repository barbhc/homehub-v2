/**
 * The Items list's cache patches — what keeps a cached list honest after a write.
 *
 * Before the list was cached, every visit re-read Firestore, so a delete was
 * always reflected. Cached, the page paints what it last saw, and SWR won't
 * refetch a key read in the last 5 s — so each write patches what the list last
 * saw (in memory, or the snapshot persisted by an earlier launch) and clears
 * the dedupe marker so the next visit refetches regardless.
 *
 * These run against SWR's DEFAULT cache, as the app does (no provider — see
 * swrPersist.ts), through a probe component that reads the key.
 */
import { describe, it, expect, beforeEach } from "vitest"
import { act, render, screen, waitFor } from "@testing-library/react"
import useSWR, { mutate } from "swr"
import type { ItemUnit, Room } from "@/integrations/types"
import { homeItemsKey, removeItemFromCache, upsertItemInCache, type HomeItemsSnapshot } from "./homeItemsCache"
import { persistSwrSnapshot, readPersistedSwrFallback } from "./swrPersist"

const item = (id: string, name: string, over: Partial<ItemUnit> = {}): ItemUnit =>
  ({ item_unit_id: id, home_id: "h1", room_id: "r1", display_name: name, status: "active", deleted_at: null, ...over }) as ItemUnit
const ROOMS = [{ room_id: "r1", home_id: "h1", name: "Kitchen", created_at: "", updated_at: "", deleted_at: null }] as Room[]
const KEY = homeItemsKey("h1")

/** Renders whatever the default cache holds for KEY; `fetcher` optional. */
function Probe({ fetcher }: { fetcher?: () => Promise<HomeItemsSnapshot> }) {
  const { data } = useSWR<HomeItemsSnapshot>(KEY, fetcher ?? null, { dedupingInterval: 5000 })
  return <ul aria-label="list">{data?.items.map((i) => <li key={i.item_unit_id}>{i.display_name}</li>)}</ul>
}
const names = () => screen.queryAllByRole("listitem").map((li) => li.textContent)
const persisted = () => readPersistedSwrFallback()[KEY] as HomeItemsSnapshot | undefined

beforeEach(async () => {
  localStorage.clear()
  // Every key in the default cache back to empty, with no refetch.
  await mutate(() => true, undefined, { revalidate: false })
})

describe("removeItemFromCache", () => {
  it("takes the item off the list in memory — a mounted list updates — and off the persisted snapshot", async () => {
    await mutate(KEY, { items: [item("a", "Fridge"), item("b", "Washer")], rooms: ROOMS }, { revalidate: false })
    render(<Probe />)
    expect(names()).toEqual(["Fridge", "Washer"])

    act(() => removeItemFromCache("h1", "a"))

    expect(names()).toEqual(["Washer"])
    expect(persisted()?.items.map((i) => i.item_unit_id)).toEqual(["b"])
  })

  it("with nothing in memory, patches the snapshot an earlier launch persisted — so the list can't paint the deleted item from it", async () => {
    persistSwrSnapshot(KEY, { items: [item("a", "Fridge"), item("b", "Washer")], rooms: ROOMS })

    removeItemFromCache("h1", "a")

    // The patched snapshot is now in memory: a later mount paints it, not App's
    // stale module-scope fallback.
    render(<Probe />)
    expect(names()).toEqual(["Washer"])
    expect(persisted()?.items.map((i) => i.item_unit_id)).toEqual(["b"])
  })

  it("does nothing when there is no list anywhere (no cache, no snapshot)", () => {
    removeItemFromCache("h1", "a")
    expect(localStorage.getItem("hh-swr-dashboard-cache")).toBeNull()
  })

  it("marks the key stale, so a revisit inside the 5 s dedupe window still refetches", async () => {
    let reads = 0
    const fetcher = async () => {
      reads++
      return { items: [item("b", "Washer")], rooms: ROOMS }
    }
    const first = render(<Probe fetcher={fetcher} />)
    await waitFor(() => expect(names()).toEqual(["Washer"]))
    first.unmount()
    expect(reads).toBe(1)

    act(() => removeItemFromCache("h1", "a"))

    // Back within 5 s: without the patch SWR would reuse the finished read.
    render(<Probe fetcher={fetcher} />)
    await waitFor(() => expect(reads).toBe(2))
  })
})

describe("upsertItemInCache", () => {
  beforeEach(async () => {
    await mutate(KEY, { items: [item("a", "Fridge"), item("b", "Washer")], rooms: ROOMS }, { revalidate: false })
  })

  it("a new item goes first — where getItemUnits' newest-first order puts it", () => {
    render(<Probe />)
    act(() => upsertItemInCache(item("c", "Dryer")))
    expect(names()).toEqual(["Dryer", "Fridge", "Washer"])
    expect(persisted()?.items.map((i) => i.item_unit_id)).toEqual(["c", "a", "b"])
  })

  it("an updated item replaces its row in place", () => {
    render(<Probe />)
    act(() => upsertItemInCache(item("b", "Laundry washer")))
    expect(names()).toEqual(["Fridge", "Laundry washer"])
  })

  it("an item that is no longer active (or is deleted) leaves the list — it only holds active items", () => {
    render(<Probe />)
    act(() => upsertItemInCache(item("a", "Fridge", { status: "stored" as ItemUnit["status"] })))
    expect(names()).toEqual(["Washer"])
    act(() => upsertItemInCache(item("b", "Washer", { deleted_at: "2026-09-30T00:00:00Z" })))
    expect(names()).toEqual([])
  })

  it("patches only its own home's list", async () => {
    await mutate(homeItemsKey("h2"), { items: [item("z", "Other home's boiler", { home_id: "h2" })], rooms: [] }, { revalidate: false })
    render(<Probe />)
    act(() => upsertItemInCache(item("z", "Other home's boiler, renamed", { home_id: "h2" })))
    expect(names()).toEqual(["Fridge", "Washer"])
  })
})
