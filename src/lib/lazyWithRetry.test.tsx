/**
 * Codex review F6 — a route that cannot load only reloads the app for a
 * replaced build.
 *
 * lazyWithRetry reloaded on ANY import failure. Offline, an uncached route's
 * import fails with the very same error a stale build gives ("Failed to fetch
 * dynamically imported module"), so opening one with no signal threw away the
 * screen the person was on and reloaded into nothing. It now asks the server
 * whether the build was replaced before it reloads; when the server cannot be
 * reached, the route shows the shared error state with Try again.
 */
import { Suspense } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { ErrorBoundary } from "@/components/layout/ErrorBoundary"
import { lazyWithRetry } from "./lazyWithRetry"

vi.mock("@sentry/react", () => ({ captureException: vi.fn() }))
vi.mock("@/components/FeedbackButton", () => ({ FeedbackButton: () => null }))

const RELOAD_FLAG = "homehub:lazy-reloaded"
const ENTRY = "/assets/index-AAAA1111.js"
/** What a browser throws when a chunk cannot be fetched — offline OR replaced. */
const importFailed = () => new TypeError("Failed to fetch dynamically imported module: https://app.test/assets/Tasks-BBBB2222.js")
const Page = () => <h1>Tasks</h1>
const html = (entry: string) => `<!doctype html><html><head><script type="module" crossorigin src="${entry}"></script></head><body></body></html>`

const reload = vi.fn()
const fetchMock = vi.fn()
let online = true

function mount(factory: () => Promise<{ default: typeof Page }>) {
  const Lazy = lazyWithRetry(factory, reload)
  return render(
    <ErrorBoundary>
      <Suspense fallback={<p>Loading…</p>}>
        <Lazy />
      </Suspense>
    </ErrorBoundary>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  online = true
  vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online)
  vi.stubGlobal("fetch", fetchMock)
  // The running build's entry script, as index.html carries it.
  const script = document.createElement("script")
  script.type = "module"
  script.setAttribute("src", ENTRY)
  script.dataset.test = "entry"
  document.head.appendChild(script)
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})
afterEach(() => {
  document.head.querySelectorAll("script[data-test=entry]").forEach((s) => s.remove())
  vi.unstubAllGlobals()
})

describe("lazyWithRetry", () => {
  it("renders the route when its import works", async () => {
    mount(async () => ({ default: Page }))
    expect(await screen.findByRole("heading", { name: "Tasks" })).toBeInTheDocument()
    expect(reload).not.toHaveBeenCalled()
  })

  it("offline → no reload; the route says it couldn't load, with Try again", async () => {
    online = false
    mount(() => Promise.reject(importFailed()))

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load this page")
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument()
    expect(reload).not.toHaveBeenCalled()
    expect(sessionStorage.getItem(RELOAD_FLAG)).toBeNull()
    // Not the whole-app crash screen either.
    expect(screen.queryByText("Something went wrong")).toBeNull()
  })

  it("the device says online but the server cannot be reached → still no reload", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"))
    mount(() => Promise.reject(importFailed()))

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load this page")
    expect(reload).not.toHaveBeenCalled()
  })

  it("a replaced build → reloads once, and stays loading until the new page takes over", async () => {
    fetchMock.mockResolvedValue({ ok: true, text: async () => html("/assets/index-CCCC3333.js") })
    mount(() => Promise.reject(importFailed()))

    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
    expect(sessionStorage.getItem(RELOAD_FLAG)).toBe("1")
    expect(screen.getByText("Loading…")).toBeInTheDocument()
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("the same build, reachable → not stale, so no reload: the error state", async () => {
    fetchMock.mockResolvedValue({ ok: true, text: async () => html(ENTRY) })
    mount(() => Promise.reject(importFailed()))

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load this page")
    expect(reload).not.toHaveBeenCalled()
  })

  it("already reloaded once this session → never a second automatic reload", async () => {
    sessionStorage.setItem(RELOAD_FLAG, "1")
    fetchMock.mockResolvedValue({ ok: true, text: async () => html("/assets/index-CCCC3333.js") })
    mount(() => Promise.reject(importFailed()))

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load this page")
    expect(reload).not.toHaveBeenCalled()
  })

  it("Try again loads the route once the connection is back", async () => {
    online = false
    const factory = vi.fn<() => Promise<{ default: typeof Page }>>().mockRejectedValueOnce(importFailed()).mockResolvedValue({ default: Page })
    mount(factory)
    const tryAgain = await screen.findByRole("button", { name: "Try again" })

    online = true
    fireEvent.click(tryAgain)

    expect(await screen.findByRole("heading", { name: "Tasks" })).toBeInTheDocument()
    expect(factory).toHaveBeenCalledTimes(2)
    expect(reload).not.toHaveBeenCalled()
  })

  it("Try again while still offline keeps the error state", async () => {
    online = false
    const factory = vi.fn<() => Promise<{ default: typeof Page }>>().mockRejectedValue(importFailed())
    mount(factory)

    fireEvent.click(await screen.findByRole("button", { name: "Try again" }))

    await waitFor(() => expect(factory).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load this page")
    expect(reload).not.toHaveBeenCalled()
  })

  it("Try again that still cannot import while the server IS reachable reloads — a browser can cache a failed import", async () => {
    online = false
    const factory = vi.fn<() => Promise<{ default: typeof Page }>>().mockRejectedValue(importFailed())
    mount(factory)
    const tryAgain = await screen.findByRole("button", { name: "Try again" })

    online = true
    fetchMock.mockResolvedValue({ ok: true, text: async () => html(ENTRY) })
    fireEvent.click(tryAgain)

    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
  })

  it("a bug inside the route's own module is not an asset failure: no reload, the crash screen", async () => {
    mount(() => Promise.reject(new ReferenceError("thing is not defined")))

    expect(await screen.findByText("Something went wrong")).toBeInTheDocument()
    expect(reload).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
