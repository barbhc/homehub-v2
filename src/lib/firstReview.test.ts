import { describe, it, expect, beforeEach } from "vitest"
import { isFirstReview, markFirstReviewSeen } from "./firstReview"

describe("firstReview", () => {
  beforeEach(() => window.localStorage.clear())

  it("is true before anything is recorded, false after", () => {
    expect(isFirstReview()).toBe(true)
    markFirstReviewSeen()
    expect(isFirstReview()).toBe(false)
  })

  it("marking twice is harmless", () => {
    markFirstReviewSeen()
    markFirstReviewSeen()
    expect(isFirstReview()).toBe(false)
  })

  it("shows the explainer when storage is unavailable, rather than teaching nobody", () => {
    const get = Storage.prototype.getItem
    Storage.prototype.getItem = () => { throw new Error("private mode") }
    try {
      expect(isFirstReview()).toBe(true)
    } finally {
      Storage.prototype.getItem = get
    }
  })

  it("does not throw when storage refuses a write", () => {
    const set = Storage.prototype.setItem
    Storage.prototype.setItem = () => { throw new Error("quota") }
    try {
      expect(() => markFirstReviewSeen()).not.toThrow()
    } finally {
      Storage.prototype.setItem = set
    }
  })
})
