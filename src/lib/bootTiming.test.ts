/**
 * The native launch segment. Pins the guard that matters: the iOS shell builds
 * its injection script once per PROCESS, so a second navigation inside the same
 * process reports a delta that includes however long the app had already been
 * running. Reporting that as "app launch took 4 minutes" would be worse than
 * reporting nothing.
 */
import { describe, it, expect, afterEach } from "vitest"
import { nativeLaunchMs } from "./bootTiming"

type NativeWindow = { __nativeLaunchMs?: number; __nativeDocStartMs?: number }

function stamp(launch: number | undefined, docStart: number | undefined) {
  const w = window as unknown as NativeWindow
  if (launch === undefined) delete w.__nativeLaunchMs
  else w.__nativeLaunchMs = launch
  if (docStart === undefined) delete w.__nativeDocStartMs
  else w.__nativeDocStartMs = docStart
}

afterEach(() => stamp(undefined, undefined))

describe("nativeLaunchMs", () => {
  it("reports the gap between process start and the web app's first instruction", () => {
    stamp(1_000_000, 1_002_400)
    expect(nativeLaunchMs()).toBe(2400)
  })

  it("is null on the web, where nothing stamps it", () => {
    expect(nativeLaunchMs()).toBeNull()
  })

  it("is null on an old shell that stamps only half the pair", () => {
    stamp(1_000_000, undefined)
    expect(nativeLaunchMs()).toBeNull()
  })

  it("discards a reload inside an already-running process rather than inventing a launch", () => {
    // App has been open for five minutes; the WebView reloads.
    stamp(1_000_000, 1_300_000)
    expect(nativeLaunchMs()).toBeNull()
  })

  it("discards a negative delta (clock skew) rather than reporting it", () => {
    stamp(1_002_400, 1_000_000)
    expect(nativeLaunchMs()).toBeNull()
  })
})
