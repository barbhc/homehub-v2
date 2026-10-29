/**
 * The shared bottom sheet's dismiss paths, in jsdom: Escape, the scrim, the ✕,
 * and the "Discard changes?" guard on a sheet holding unsaved input. The drag
 * and the springs need real frames and pointer events — those are pinned in
 * e2e/device/sheet-motion.spec.ts; the release maths in src/lib/sheetGesture.test.ts.
 */
import { describe, it, expect, vi } from "vitest"
import { useState } from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { BottomSheet } from "./BottomSheet"
import { useSheetDirty, useSheetDismiss } from "./bottomSheetDirty"

function Harness({ dirty = false, viaHook = false, onClose = vi.fn() }: { dirty?: boolean; viaHook?: boolean; onClose?: () => void }) {
  const [open, setOpen] = useState(true)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open it</button>
      <BottomSheet
        open={open}
        onOpenChange={(o) => { if (!o) { onClose(); setOpen(false) } }}
        label="Test sheet"
        isDirty={viaHook ? undefined : dirty}
        showCloseButton
      >
        {viaHook ? <DirtyBody dirty={dirty} /> : <p>Body</p>}
      </BottomSheet>
    </>
  )
}

function DirtyBody({ dirty }: { dirty: boolean }) {
  useSheetDirty(dirty)
  return <p>Body</p>
}

const prompt = () => screen.queryByRole("alertdialog", { name: "Discard changes?" })

/** A tap on the scrim. Radix listens for the outside pointerdown a tick after
 *  the sheet mounts, and acts on the click that completes it. */
async function tapScrim() {
  await new Promise((r) => setTimeout(r, 0))
  const scrim = screen.getByTestId("sheet-scrim")
  fireEvent.pointerDown(scrim, { button: 0 })
  fireEvent.click(scrim)
  await new Promise((r) => setTimeout(r, 0))
}

describe("BottomSheet", () => {
  it("is a modal dialog named by its label", () => {
    render(<Harness />)
    const dialog = screen.getByRole("dialog", { name: "Test sheet" })
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute("aria-modal", "true")
  })

  it("Escape closes a clean sheet", async () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" })
    expect(onClose).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })

  it("the ✕ closes a clean sheet", () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    fireEvent.click(screen.getByRole("button", { name: "Close" }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("a scrim tap closes a clean sheet", async () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    await tapScrim()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  for (const viaHook of [false, true]) {
    describe(viaHook ? "dirty via useSheetDirty" : "dirty via isDirty", () => {
      it("Escape asks instead of closing; Keep editing keeps it open", () => {
        const onClose = vi.fn()
        render(<Harness dirty viaHook={viaHook} onClose={onClose} />)
        fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" })
        expect(onClose).not.toHaveBeenCalled()
        expect(prompt()).toBeInTheDocument()
        fireEvent.click(screen.getByRole("button", { name: "Keep editing" }))
        expect(prompt()).toBeNull()
        expect(screen.getByRole("dialog", { name: "Test sheet" })).toBeInTheDocument()
        expect(onClose).not.toHaveBeenCalled()
      })

      it("the ✕ and the scrim ask too; Discard closes", async () => {
        const onClose = vi.fn()
        render(<Harness dirty viaHook={viaHook} onClose={onClose} />)
        fireEvent.click(screen.getByRole("button", { name: "Close" }))
        expect(prompt()).toBeInTheDocument()
        fireEvent.click(screen.getByRole("button", { name: "Keep editing" }))
        await tapScrim()
        expect(prompt()).toBeInTheDocument()
        expect(onClose).not.toHaveBeenCalled()
        fireEvent.click(screen.getByRole("button", { name: "Discard" }))
        expect(onClose).toHaveBeenCalledTimes(1)
      })
    })
  }

  it("a close control inside the content goes through the same dirty gate (useSheetDismiss)", () => {
    function Body({ dirty }: { dirty: boolean }) {
      useSheetDirty(dirty)
      const dismiss = useSheetDismiss(() => { throw new Error("fallback used inside a sheet") })
      return <button type="button" onClick={dismiss}>Header close</button>
    }
    function Host({ dirty, onClose }: { dirty: boolean; onClose: () => void }) {
      const [open, setOpen] = useState(true)
      return (
        <BottomSheet open={open} onOpenChange={(o) => { if (!o) { onClose(); setOpen(false) } }} label="Test sheet">
          <Body dirty={dirty} />
        </BottomSheet>
      )
    }
    const dirtyClose = vi.fn()
    const { unmount } = render(<Host dirty onClose={dirtyClose} />)
    fireEvent.click(screen.getByRole("button", { name: "Header close" }))
    expect(dirtyClose).not.toHaveBeenCalled()
    expect(prompt()).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Discard" }))
    expect(dirtyClose).toHaveBeenCalledTimes(1)
    unmount()

    const cleanClose = vi.fn()
    render(<Host dirty={false} onClose={cleanClose} />)
    fireEvent.click(screen.getByRole("button", { name: "Header close" }))
    expect(cleanClose).toHaveBeenCalledTimes(1)
  })

  it("focus returns to the control that opened it", async () => {
    function Opener() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Open it</button>
          <BottomSheet open={open} onOpenChange={setOpen} label="Test sheet" showCloseButton>
            <p>Body</p>
          </BottomSheet>
        </>
      )
    }
    render(<Opener />)
    const opener = screen.getByRole("button", { name: "Open it" })
    opener.focus()
    fireEvent.click(opener)
    await waitFor(() => expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement))
    fireEvent.click(screen.getByRole("button", { name: "Close" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(opener))
  })
})
