/**
 * The item photo at 44px — the round-15 control beside the name (HH-136).
 *
 * Owner, 2026-09-06: "the camera icon is sitting on top of a photo of the
 * item." Only the empty state had been designed for this size; a photo fell
 * through to the tile and its two 32px corner controls covered the picture.
 */
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { BoxIcon } from "lucide-react"
import type { ItemUnit } from "@/integrations/types"

const storageUrl = vi.hoisted(() => ({ value: null as string | null }))
vi.mock("@/hooks/useStorageUrl", () => ({ useStorageUrl: () => storageUrl.value }))
vi.mock("@/modules/auth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }))
const uploadItemPhoto = vi.hoisted(() => vi.fn())
vi.mock("@/modules/inventory/services/storageService", () => ({ uploadItemPhoto: (...a: unknown[]) => uploadItemPhoto(...a) }))
vi.mock("@/components/inventory/PhotoSearchSheet", () => ({ PhotoSearchSheet: () => null }))
vi.mock("@/lib/storageUrlCache", () => ({ invalidateCachedStorageUrl: vi.fn() }))
vi.mock("swr", () => ({ mutate: vi.fn() }))

const { ItemPhoto } = await import("./ItemPhoto")

const item = (over: Partial<ItemUnit> = {}) =>
  ({ item_unit_id: "i1", display_name: "Levoit Core Air Purifiers", photo_storage_ref: null, ...over }) as ItemUnit

describe("ItemPhoto — the 44px control beside the name", () => {
  it("with a photo, the thumb IS the control: nothing is drawn on top of the picture", () => {
    storageUrl.value = "blob:photo"
    render(<ItemPhoto item={item({ photo_storage_ref: "homes/h1/items/i1/photo.jpg" })} homeId="h1" Glyph={BoxIcon} emptyVariant="icon" className="size-11 rounded-xl" />)
    const thumb = screen.getByLabelText("Replace photo")
    expect(thumb.querySelector("img")).toHaveAttribute("src", "blob:photo")
    expect(thumb.querySelector('input[type="file"]')).toBeTruthy()
    // The two tile controls that covered the photo are not rendered here.
    expect(screen.queryByLabelText("Find a product photo")).toBeNull()
    expect(document.querySelectorAll(".size-8").length).toBe(0)
  })

  it("without a photo, the dashed 44px invitation is unchanged", () => {
    storageUrl.value = null
    render(<ItemPhoto item={item()} homeId="h1" Glyph={BoxIcon} emptyVariant="icon" className="size-11 rounded-xl" />)
    expect(screen.getByLabelText("Add a photo")).toBeTruthy()
    expect(screen.queryByLabelText("Replace photo")).toBeNull()
  })

  it("the desktop tile keeps both corner controls — it has the room", () => {
    storageUrl.value = "blob:photo"
    render(<ItemPhoto item={item({ photo_storage_ref: "homes/h1/items/i1/photo.jpg" })} homeId="h1" Glyph={BoxIcon} className="size-[132px] rounded-2xl" />)
    expect(screen.getByLabelText("Find a product photo")).toBeTruthy()
    expect(screen.getByLabelText("Replace photo")).toBeTruthy()
  })

  it("a failed replacement says so beside the thumb — never a silent no-op", async () => {
    storageUrl.value = "blob:photo"
    uploadItemPhoto.mockResolvedValue({ data: null, error: { message: "That file is too big" } })
    render(<ItemPhoto item={item({ photo_storage_ref: "homes/h1/items/i1/photo.jpg" })} homeId="h1" Glyph={BoxIcon} emptyVariant="icon" className="size-11 rounded-xl" />)
    const input = screen.getByLabelText("Replace photo").querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(["x"], "big.png", { type: "image/png" })] } })
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/too big/i))
    expect(screen.getByLabelText("Replace photo").querySelector("img")).toBeTruthy()
  })
})
