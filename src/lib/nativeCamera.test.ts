/**
 * The camera failure UX, pinned. A tester reported the same failure twice:
 * photo taken successfully, then a red "couldn't open the camera" banner and a
 * second camera. The fix has three parts — no URL read-back (base64 has no
 * origin), classified failures, and silence when the fallback still gets the
 * user to their goal.
 */
import { describe, it, expect } from "vitest"
import { classifyCameraFailure, base64ToFile } from "./nativeCamera"

describe("classifyCameraFailure", () => {
  it("recognises the denials only the user can fix", () => {
    expect(classifyCameraFailure("User denied access to camera")).toBe("permission")
    expect(classifyCameraFailure("Camera permission was not granted")).toBe("permission")
    expect(classifyCameraFailure("Access to the camera is restricted")).toBe("permission")
  })

  it("everything else is ours to absorb silently", () => {
    expect(classifyCameraFailure("Failed to fetch")).toBe("other")           // the cross-origin read-back
    expect(classifyCameraFailure("plugin not implemented")).toBe("other")    // stale binary
    expect(classifyCameraFailure("Camera returned no image.")).toBe("other")
  })
})

describe("base64ToFile", () => {
  it("decodes without any URL layer that could refuse it", () => {
    // "hello" in base64 — content survives the round trip.
    const f = base64ToFile("aGVsbG8=", "nameplate.jpeg", "image/jpeg")
    expect(f.name).toBe("nameplate.jpeg")
    expect(f.type).toBe("image/jpeg")
    expect(f.size).toBe(5)
  })
})
