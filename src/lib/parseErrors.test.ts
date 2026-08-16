/**
 * Pins the reported failure: a pasted manual URL served an HTML page, the
 * worker sent it to Claude as a PDF, and the tester's banner read
 * `Manual saved, but parsing failed: 400 {"type":"error",…,"request_id":…}`.
 */
import { describe, it, expect } from "vitest"
import { looksLikePdf, looksLikeHtml, humanizeParseError, PARSE_ERR } from "../../shared/parse/parseErrors"

const enc = (s: string) => new TextEncoder().encode(s)

describe("looksLikePdf / looksLikeHtml", () => {
  it("accepts a real PDF header", () => {
    expect(looksLikePdf(enc("%PDF-1.7\n…"))).toBe(true)
  })

  it("accepts a header preceded by junk within the first 1KB (spec allows it)", () => {
    expect(looksLikePdf(enc("﻿  \n%PDF-1.4"))).toBe(true)
  })

  it("rejects the login/bot-check page a manufacturer site returns with 200", () => {
    const page = enc("<!DOCTYPE html><html><head><title>Please sign in</title>")
    expect(looksLikePdf(page)).toBe(false)
    expect(looksLikeHtml(page)).toBe(true)
  })

  it("rejects an empty body without claiming it was HTML", () => {
    expect(looksLikePdf(enc(""))).toBe(false)
    expect(looksLikeHtml(enc(""))).toBe(false)
  })
})

describe("humanizeParseError", () => {
  it("maps the exact reported Anthropic 400 to actionable copy", () => {
    const raw =
      '400 {"type":"error","error":{"type":"invalid_request_error","message":"messages.0.content.0.document.source.base64.data: The PDF specified was not valid."},"request_id":"req_011Ce5uM3sAo1L9SPHL55PHt"}'
    expect(humanizeParseError(raw)).toBe(PARSE_ERR.pdfUnreadable)
  })

  it("collapses any other raw API blob to the generic line instead of leaking it", () => {
    const raw = '429 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}'
    const out = humanizeParseError(raw)
    expect(out).toBe(PARSE_ERR.generic)
    expect(out).not.toContain("{")
  })

  it("passes already-human messages through untouched", () => {
    expect(humanizeParseError(PARSE_ERR.urlNotPdf)).toBe(PARSE_ERR.urlNotPdf)
    expect(humanizeParseError("Parsing timed out. Try again.")).toBe("Parsing timed out. Try again.")
  })

  it("never returns an empty string", () => {
    expect(humanizeParseError("")).toBe(PARSE_ERR.generic)
  })
})
