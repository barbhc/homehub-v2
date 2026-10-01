/**
 * The photo's fade-in and its one retry belong to the URL being shown.
 *
 * Both used to be booleans an effect reset when the URL changed — a frame
 * late (H5, react-hooks/set-state-in-effect). They are now stored as the URL
 * they hold for. Pinned, per URL:
 *  - the image is transparent until THAT url has loaded, then fades in;
 *  - a failed load drops the cached url and re-resolves it — once;
 *  - a new url (the re-resolved token, a replaced photo) gets its own fade
 *    and its own retry.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { BoxIcon } from "lucide-react"
import type { ItemUnit } from "@/integrations/types"

const storageUrl = vi.hoisted(() => ({ value: null as string | null }))
const invalidate = vi.hoisted(() => vi.fn())
const mutate = vi.hoisted(() => vi.fn())
vi.mock("@/hooks/useStorageUrl", () => ({ useStorageUrl: () => storageUrl.value }))
vi.mock("@/modules/auth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }))
vi.mock("@/modules/inventory/services/storageService", () => ({ uploadItemPhoto: vi.fn() }))
vi.mock("@/components/inventory/PhotoSearchSheet", () => ({ PhotoSearchSheet: () => null }))
vi.mock("@/lib/storageUrlCache", () => ({ invalidateCachedStorageUrl: (...a: unknown[]) => invalidate(...a) }))
vi.mock("swr", () => ({ mutate: (...a: unknown[]) => mutate(...a) }))

const { ItemPhoto } = await import("./ItemPhoto")

const ITEM = {
  item_unit_id: "i1", display_name: "Levoit Core 300", photo_storage_ref: "homes/h1/items/i1/photo.jpg",
} as ItemUnit

const photo = () => screen.getByRole("img", { name: "Levoit Core 300" })
const tile = () => <ItemPhoto item={ITEM} homeId="h1" Glyph={BoxIcon} className="size-[132px] rounded-2xl" />

describe("ItemPhoto · fade-in and retry, per url", () => {
  beforeEach(() => {
    invalidate.mockClear()
    mutate.mockClear()
  })

  it("stays transparent until its url loads, and a new url starts transparent again", () => {
    storageUrl.value = "https://cdn.test/photo.jpg?token=a"
    const { rerender } = render(tile())
    expect(photo()).toHaveClass("opacity-0")

    fireEvent.load(photo())
    expect(photo()).toHaveClass("opacity-100")

    storageUrl.value = "https://cdn.test/photo.jpg?token=b"
    rerender(tile())
    expect(photo()).toHaveClass("opacity-0")
    fireEvent.load(photo())
    expect(photo()).toHaveClass("opacity-100")
  })

  it("retries a failed url once, and a re-resolved url gets a retry of its own", () => {
    storageUrl.value = "https://cdn.test/photo.jpg?token=stale"
    const { rerender } = render(tile())

    fireEvent.error(photo())
    expect(invalidate).toHaveBeenCalledTimes(1)
    expect(invalidate).toHaveBeenCalledWith(ITEM.photo_storage_ref)
    expect(mutate).toHaveBeenCalledWith(["storage-url", ITEM.photo_storage_ref])

    // The same url failing again is not retried — no loop.
    fireEvent.error(photo())
    expect(invalidate).toHaveBeenCalledTimes(1)

    // The re-resolve produced a new url; if that fails too, it is retried once.
    storageUrl.value = "https://cdn.test/photo.jpg?token=fresh"
    rerender(tile())
    fireEvent.error(photo())
    expect(invalidate).toHaveBeenCalledTimes(2)
  })
})
