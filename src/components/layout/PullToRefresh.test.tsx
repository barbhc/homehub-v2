/**
 * PullToRefresh, the component: wiring the gesture rules to real touch events.
 * The rules themselves are pinned in src/lib/pullToRefresh.test.ts.
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, render, screen } from "@testing-library/react"
import { PullToRefresh } from "./PullToRefresh"

function touch(type: string, target: Element, y?: number, x = 100) {
  const e = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(e, "touches", { value: y === undefined ? [] : [{ clientX: x, clientY: y }] })
  target.dispatchEvent(e)
  return e
}
async function settle() {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

afterEach(() => vi.restoreAllMocks())

describe("PullToRefresh", () => {
  it("disabled (desktop): no spinner, no listeners, a plain div", async () => {
    const onRefresh = vi.fn(async () => {})
    const { container } = render(<PullToRefresh enabled={false} onRefresh={onRefresh}><p>page</p></PullToRefresh>)
    expect(container.querySelector("[data-pull-spinner]")).toBeNull()
    const p = screen.getByText("page")
    await act(async () => {
      touch("touchstart", p, 100)
      touch("touchmove", p, 200)
      touch("touchend", p)
      await settle()
    })
    expect(onRefresh).not.toHaveBeenCalled()
  })

  it("a second pull while the first refresh runs starts nothing", async () => {
    let finish: () => void = () => {}
    const onRefresh = vi.fn(() => new Promise<void>((r) => { finish = r }))
    render(<PullToRefresh enabled onRefresh={onRefresh}><p>page</p></PullToRefresh>)
    const p = screen.getByText("page")
    const pullOnce = async () => {
      await act(async () => {
        touch("touchstart", p, 100)
        touch("touchmove", p, 140)
        touch("touchmove", p, 190)
        touch("touchend", p)
        await settle()
      })
    }
    await pullOnce()
    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("status")).toHaveTextContent("Refreshing")
    await pullOnce()
    expect(onRefresh).toHaveBeenCalledTimes(1)
    await act(async () => { finish(); await settle() })
    expect(screen.queryByRole("status")).toBeNull()
    await pullOnce()
    expect(onRefresh).toHaveBeenCalledTimes(2)
  })

  it("a rejected reload is logged, ends the spinner, and frees the pull", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    const onRefresh = vi.fn(async () => { throw new Error("network down") })
    render(<PullToRefresh enabled onRefresh={onRefresh}><p>page</p></PullToRefresh>)
    const p = screen.getByText("page")
    await act(async () => {
      touch("touchstart", p, 100)
      touch("touchmove", p, 200)
      touch("touchend", p)
      await settle()
    })
    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledWith("[pull-to-refresh] refresh failed:", "network down")
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("a touch inside something scrolled down is that scroller's, not a pull", async () => {
    const onRefresh = vi.fn(async () => {})
    render(
      <PullToRefresh enabled onRefresh={onRefresh}>
        <div data-testid="inner" style={{ overflowY: "auto" }}><p>row</p></div>
      </PullToRefresh>,
    )
    const inner = screen.getByTestId("inner")
    inner.scrollTop = 120
    // jsdom has no layout, so scrollTop only sticks if we define it.
    Object.defineProperty(inner, "scrollTop", { value: 120, configurable: true })
    const row = screen.getByText("row")
    let move: Event | undefined
    await act(async () => {
      touch("touchstart", row, 100)
      move = touch("touchmove", row, 200)
      touch("touchend", row)
      await settle()
    })
    expect(onRefresh).not.toHaveBeenCalled()
    expect(move?.defaultPrevented).toBe(false)
  })

  for (const reduce of [false, true]) {
    it(reduce ? "Reduce Motion: the page stays put; only the spinner fades in" : "mid-pull, the page follows the finger with resistance", async () => {
      const real = window.matchMedia.bind(window)
      vi.spyOn(window, "matchMedia").mockImplementation((q: string) =>
        q.includes("prefers-reduced-motion") ? ({ ...real(q), matches: reduce, media: q } as MediaQueryList) : real(q),
      )
      const { container } = render(<PullToRefresh enabled onRefresh={async () => {}} data-testid="root"><p>page</p></PullToRefresh>)
      const p = screen.getByText("page")
      await act(async () => {
        touch("touchstart", p, 100)
        touch("touchmove", p, 140)
        touch("touchmove", p, 180)
      })
      const root = screen.getByTestId("root")
      const spinner = container.querySelector("[data-pull-spinner]") as HTMLElement
      if (reduce) {
        expect(root.style.transform).toBe("")
      } else {
        const y = Number(/translate3d\(0(?:px)?, ([\d.]+)px/.exec(root.style.transform)?.[1])
        expect(y).toBeGreaterThan(40)
        expect(y).toBeLessThan(80)
      }
      expect(Number(spinner.style.opacity)).toBe(1)
      await act(async () => { touch("touchcancel", p); await settle() })
    })
  }
})
