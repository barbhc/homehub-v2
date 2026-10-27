import {
  useCallback, useEffect, useLayoutEffect, useRef, useState,
  type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode,
} from "react"
import { Dialog as DialogPrimitive } from "radix-ui"
import { XIcon } from "lucide-react"
import { AnimatePresence, usePresence, useReducedMotionConfig } from "motion/react"
import { cn } from "@/lib/utils"
import { DURATION } from "@/lib/motion"
import { springTo as springAnim, tweenTo, type FrameAnimation } from "@/lib/sheetAnimation"
import { useIsDesktop } from "@/hooks/useIsDesktop"
import {
  dismissDecision, releaseDecision, releaseVelocity, rubberBand, scrimFor, type DragSample,
} from "@/lib/sheetGesture"
import { SheetDirtyContext } from "./bottomSheetDirty"

/**
 * THE bottom sheet (Apple polish phase 2). Every sheet that rises from the
 * bottom of a phone is this component, so they all move, drag and dismiss the
 * same way — the approved demo is https://claude.ai/artifact/1DwQLYdx2ewMk3RoYrxp8t.
 *
 * - Opens: the scrim fades in (--dur-fade) while the sheet rises on SPRING_SHEET.
 * - The grabber, and any header (`data-sheet-drag`, or a `SheetHeader`), drag
 *   the sheet: 1:1 downward, rubber-banded upward, the scrim following. Only
 *   those areas drag, so scrolling the content is never hijacked.
 * - Release: past 30% of its height, or a downward flick faster than
 *   SHEET_FLICK_VELOCITY (600 px/s), closes it with the release velocity carried into the
 *   closing spring; anything else springs back with that velocity. Every
 *   animation can be grabbed mid-flight.
 * - Scrim tap, Escape and the sheet's own close controls also close it. A sheet
 *   holding unsaved input (`isDirty`, or `useSheetDirty` from ./bottomSheetDirty) asks
 *   "Discard changes?" instead of losing it — except through the sheet's own
 *   explicit Cancel/Save, which close it as before.
 * - Reduce Motion: nothing slides; the sheet and scrim fade. The finger still
 *   moves the sheet directly.
 *
 * Built on Radix Dialog, as the old `SheetContent` was, for role=dialog,
 * aria-modal, the focus trap, Escape, scroll lock and aria-hidden on the page
 * behind. `SheetTitle`/`SheetDescription`/`SheetHeader` from ./sheet work
 * inside it unchanged. Focus returns to whatever opened it (Radix returns it
 * only to a `Dialog.Trigger`, which none of the app's sheets use).
 *
 * Presence is AnimatePresence keyed on `open`, so render it ALWAYS and drive it
 * with `open` — a sheet mounted only while open has no exit to animate. Keep
 * per-open state in a child component: while the sheet animates out, the child
 * keeps rendering its last content.
 */

type Layer = "base" | "raised"
const LAYER: Record<Layer, { scrim: string; panel: string }> = {
  // The old Radix SheetContent's layer. Its portal comes after the tab bar
  // (z-50) in the DOM, so it paints above it, and a Select/Popover opened from
  // inside (also z-50, portalled later) still paints above the sheet.
  base: { scrim: "z-50", panel: "z-50" },
  // The hand-built sheets' layers (TaskEditSheet's comment has the history):
  // explicitly above the tab bar.
  raised: { scrim: "z-[60]", panel: "z-[70]" },
}

/** The old `SheetContent side="bottom"` surface, for sheets converted from it. */
export const SHEET_SURFACE = "bg-background flex flex-col gap-4 border-t shadow-lg"

/** The grabber pill (36×5, --hh-grab), in flow — for sheets that place their
 *  own. Its touch area reaches well past the pill (the ::before), so a thumb
 *  doesn't have to find a 5px line. */
export function SheetGrabber({ className }: { className?: string }) {
  return (
    <div
      data-sheet-drag=""
      data-testid="sheet-grabber"
      aria-hidden
      className={cn(
        "relative mx-auto h-[5px] w-9 shrink-0 rounded-full before:absolute before:-inset-x-16 before:-inset-y-3 before:content-['']",
        className,
      )}
      style={{ background: "var(--hh-grab)" }}
    />
  )
}

export interface BottomSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
  /** Accessible name, rendered as a visually hidden title. Omit when the
   *  content has its own `SheetTitle`. */
  label?: string
  /** Unsaved input: a drag, scrim tap or Escape asks before closing. */
  isDirty?: boolean
  /** The panel's own size, shape and surface. */
  className?: string
  style?: CSSProperties
  layer?: Layer
  /** "overlay" draws the grabber over the panel's top padding; "none" when the
   *  content places its own <SheetGrabber/> in flow. */
  grabber?: "overlay" | "none"
  /** The old SheetContent ✕ in the top-right corner. */
  showCloseButton?: boolean
  /** At `lg` this sheet is a floating panel, not a sheet: no grabber, no drag,
   *  and it fades rather than rising. */
  desktopPanel?: boolean
  testId?: string
}

export function BottomSheet(props: BottomSheetProps) {
  const { open, onOpenChange } = props
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => { if (!o) onOpenChange(false) }}>
      <AnimatePresence>{open && <SheetPanel key="sheet" {...props} />}</AnimatePresence>
    </DialogPrimitive.Root>
  )
}

/** Panel position at rest/offscreen and fade, written straight to the DOM each
 *  frame (no re-render per frame). */
interface Pose { y: number; fade: number; scrimIn: number; h: number }

function SheetPanel({
  onOpenChange, children, label, isDirty = false, className, style, layer = "base",
  grabber = "overlay", showCloseButton = false, desktopPanel = false, testId,
}: BottomSheetProps) {
  const [isPresent, safeToRemove] = usePresence()
  const reduceMotion = useReducedMotionConfig() ?? false
  const isDesktop = useIsDesktop()
  // Decided once per open: a sheet doesn't change how it moves mid-flight.
  const [mode] = useState<"spring" | "fade" | "panel">(() =>
    desktopPanel && isDesktop ? "panel" : reduceMotion ? "fade" : "spring")
  const draggable = mode !== "panel"
  // Read in the render that mounts the panel: the opener still has focus.
  const [opener] = useState(() => (typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null)))
  // The first paint is already offscreen (spring) or transparent (fade), so the
  // sheet never flashes at rest before it rises.
  const [initial] = useState<Pose>(() => ({
    y: mode === "spring" ? (typeof window === "undefined" ? 2000 : window.innerHeight) : 0,
    fade: mode === "spring" ? 1 : 0,
    scrimIn: 0,
    h: 1,
  }))
  const pose = useRef<Pose>({ ...initial })
  const panelRef = useRef<HTMLDivElement>(null)
  const scrimRef = useRef<HTMLDivElement>(null)
  const anims = useRef<FrameAnimation[]>([])
  const drag = useRef<{ id: number; startY: number; base: number; samples: DragSample[] } | null>(null)
  const exitVelocity = useRef(0)
  const dirtyFromContent = useRef(false)
  const unmounted = useRef(false)
  const [confirming, setConfirming] = useState(false)

  const setContentDirty = useCallback((d: boolean) => { dirtyFromContent.current = d }, [])
  const dirty = () => isDirty || dirtyFromContent.current

  const paint = useCallback(() => {
    const p = pose.current
    const panel = panelRef.current
    if (panel) {
      // At rest: no transform at all, so the panel isn't left on its own
      // compositing layer and its text rasterises exactly as a static panel's.
      panel.style.transform = p.y === 0 ? "none" : `translate3d(0, ${p.y}px, 0)`
      panel.style.opacity = String(p.fade)
    }
    if (scrimRef.current) scrimRef.current.style.opacity = String(p.fade * Math.min(p.scrimIn, scrimFor(p.y, p.h)))
  }, [])

  const stopAll = () => {
    for (const a of anims.current) a.stop()
    anims.current = []
  }
  const run = (a: FrameAnimation) => { anims.current.push(a) }
  const measure = () => {
    pose.current.h = Math.max(1, panelRef.current?.offsetHeight ?? 1)
    return pose.current.h
  }
  const springTo = (to: number, velocity: number, onUpdate?: (y: number) => void, onComplete?: () => void) =>
    springAnim(pose.current.y, to, velocity, (y) => { pose.current.y = y; paint(); onUpdate?.(y) }, onComplete)
  const fadeTo = (to: number, onComplete?: () => void) =>
    tweenTo(pose.current.fade, to, DURATION.fade, (f) => { pose.current.fade = f; paint() }, onComplete)

  // Enter — from the panel's ref, not an effect: Radix's Portal mounts its
  // content one render after this component, so in this component's own
  // layout effect the panel doesn't exist yet and measures 0px tall. The ref
  // fires as the panel attaches, still before the first paint.
  const entered = useRef(false)
  const enter = () => {
    const h = measure()
    if (mode === "spring") {
      pose.current.y = h
      paint()
      run(springTo(0, 0))
      run(tweenTo(0, 1, DURATION.fade, (s) => { pose.current.scrimIn = s; paint() }))
    } else {
      pose.current.scrimIn = 1
      run(fadeTo(1))
    }
  }
  const attachPanel = (node: HTMLDivElement | null) => {
    panelRef.current = node
    if (node && !entered.current) {
      entered.current = true
      enter()
    }
  }
  useLayoutEffect(() => {
    // StrictMode mounts, unmounts and remounts once in development.
    unmounted.current = false
    return () => { unmounted.current = true; stopAll() }
  }, [])

  // Exit: AnimatePresence keeps this mounted until safeToRemove.
  useEffect(() => {
    if (isPresent) return
    let settled = false
    const done = () => { if (!settled) { settled = true; safeToRemove() } }
    stopAll()
    drag.current = null
    const setPointer = (v: string) => {
      if (panelRef.current) panelRef.current.style.pointerEvents = v
      if (scrimRef.current) scrimRef.current.style.pointerEvents = v
    }
    // The page is usable again the moment the sheet starts to leave.
    setPointer("none")
    if (mode === "spring") {
      const h = measure()
      // Finished once it is fully below the screen edge — not when the spring
      // settles, which would hold the page's pointer lock for nothing.
      run(springTo(h + 20, exitVelocity.current, (y) => { if (y >= h) done() }, done))
    } else {
      run(fadeTo(0, done))
    }
    return () => {
      // Reopened mid-exit (same sheet, present again): come back up from
      // wherever it is. On a real unmount the panel is already gone.
      if (settled || unmounted.current) return
      settled = true
      stopAll()
      exitVelocity.current = 0
      setPointer("")
      run(mode === "spring" ? springTo(0, 0) : fadeTo(1))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when presence flips
  }, [isPresent])

  const requestDismiss = () => {
    if (!isPresent) return
    if (dismissDecision(dirty()) === "confirm-discard") setConfirming(true)
    else onOpenChange(false)
  }

  // ── Drag ────────────────────────────────────────────────────────────────────
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggable || !isPresent || confirming || e.button !== 0) return
    const target = e.target as Element
    const zone = target.closest("[data-sheet-drag], [data-slot='sheet-header']")
    if (!zone || !e.currentTarget.contains(zone)) return
    // A button or field inside the header keeps its own tap.
    const control = target.closest("button, a, input, textarea, select, label, [role='button'], [contenteditable='true']")
    if (control && zone.contains(control)) return
    stopAll()
    pose.current.scrimIn = 1
    if (mode === "fade") pose.current.fade = 1
    measure()
    drag.current = { id: e.pointerId, startY: e.clientY, base: pose.current.y, samples: [[e.timeStamp, e.clientY]] }
    e.currentTarget.setPointerCapture(e.pointerId)
    paint()
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || e.pointerId !== d.id) return
    pose.current.y = rubberBand(d.base + (e.clientY - d.startY))
    paint()
    d.samples.push([e.timeStamp, e.clientY])
    if (d.samples.length > 32) d.samples.shift()
  }
  const onPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || e.pointerId !== d.id) return
    drag.current = null
    // A cancelled pointer (the OS took the touch) carries no intent to flick.
    const velocity = e.type === "pointerup" ? releaseVelocity(d.samples, e.timeStamp) : 0
    const decision = releaseDecision({ offset: pose.current.y, height: pose.current.h, velocity, dirty: dirty() })
    if (decision === "dismiss") {
      exitVelocity.current = velocity
      onOpenChange(false)
      return
    }
    run(springTo(0, velocity))
    if (decision === "confirm-discard") setConfirming(true)
  }

  const layers = LAYER[layer]
  return (
    <DialogPrimitive.Portal forceMount>
      <DialogPrimitive.Overlay
        forceMount
        ref={scrimRef}
        data-testid="sheet-scrim"
        className={cn("fixed inset-0", layers.scrim)}
        style={{ background: "rgba(8,12,11,0.4)", opacity: 0 }}
      />
      <DialogPrimitive.Content
        forceMount
        ref={attachPanel}
        data-testid={testId ?? "bottom-sheet"}
        data-sheet-mode={mode}
        // Radix hides the page behind from assistive tech (aria-hidden) but
        // doesn't say so on the dialog itself.
        aria-modal="true"
        onEscapeKeyDown={(e) => {
          e.preventDefault()
          if (confirming) setConfirming(false)
          else requestDismiss()
        }}
        onPointerDownOutside={(e) => {
          e.preventDefault()
          if (confirming) setConfirming(false)
          else requestDismiss()
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          if (opener?.isConnected) opener.focus({ preventScroll: true })
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        className={cn(
          "fixed inset-x-0 bottom-0 outline-none overscroll-contain [&>*]:min-w-0 [&_.overflow-y-auto]:overscroll-contain",
          // Drag areas take the whole touch: a vertical drag there moves the
          // sheet, never the page or the content.
          draggable && "[&_[data-sheet-drag]]:touch-none [&_[data-slot='sheet-header']]:touch-none",
          layers.panel,
          className,
        )}
        style={{
          ...style,
          transform: initial.y === 0 ? "none" : `translate3d(0, ${initial.y}px, 0)`,
          opacity: initial.fade,
        }}
      >
        <SheetDirtyContext.Provider value={setContentDirty}>
          {label && <DialogPrimitive.Title className="sr-only">{label}</DialogPrimitive.Title>}
          {draggable && grabber === "overlay" && (
            <div data-sheet-drag="" className="absolute inset-x-0 top-0 flex h-5 justify-center pt-1.5">
              <span data-testid="sheet-grabber" aria-hidden className="h-[5px] w-9 rounded-full" style={{ background: "var(--hh-grab)" }} />
            </div>
          )}
          {children}
          {showCloseButton && (
            // The old SheetContent ✕ (HH-108: a 44px target, not the icon's box).
            <button
              type="button"
              onClick={requestDismiss}
              className="ring-offset-background focus:ring-ring absolute top-2 right-2 flex size-11 items-center justify-center rounded-md opacity-70 transition-opacity hover:bg-muted hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden"
            >
              <XIcon className="size-4" />
              <span className="sr-only">Close</span>
            </button>
          )}
          {/* Rubber-banding upward lifts the panel off the bottom edge; this
              skirt, in the panel's own background, keeps the gap filled. */}
          {draggable && (
            <div aria-hidden className="pointer-events-none absolute inset-x-0 top-full h-[40vh]" style={{ background: "inherit" }} />
          )}
          {confirming && (
            <DiscardPrompt
              onKeep={() => setConfirming(false)}
              onDiscard={() => { setConfirming(false); onOpenChange(false) }}
            />
          )}
        </SheetDirtyContext.Provider>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

/** HIG: closing a sheet with unsaved changes asks first. In the sheet, not a
 *  second portal — stacked portals on a phone are how a modal becomes
 *  undismissable. */
function DiscardPrompt({ onKeep, onDiscard }: { onKeep: () => void; onDiscard: () => void }) {
  return (
    <div
      className="absolute inset-0 z-10 flex items-end rounded-[inherit] p-3 pb-[calc(12px+env(safe-area-inset-bottom))]"
      style={{ background: "color-mix(in srgb, var(--hh-surface) 72%, transparent)" }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="sheet-discard-title"
        data-testid="sheet-discard-prompt"
        className="w-full rounded-2xl border p-4 shadow-[0_8px_28px_rgba(8,12,11,0.18)]"
        style={{ background: "var(--hh-surface)", borderColor: "var(--hh-line2)" }}
      >
        <p id="sheet-discard-title" className="mb-3 text-center text-[0.9375rem] font-bold" style={{ color: "var(--hh-ink)" }}>
          Discard changes?
        </p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            autoFocus
            onClick={onKeep}
            className="hh-press w-full rounded-xl py-3 text-[0.9375rem] font-bold text-white"
            style={{ background: "var(--hh-teal-fill)" }}
          >
            Keep editing
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className="hh-press w-full rounded-xl py-3 text-[0.9375rem] font-semibold"
            style={{ color: "var(--hh-clay)" }}
          >
            Discard
          </button>
        </div>
      </div>
    </div>
  )
}
