/**
 * Production Claude extraction call. Forced tool use (EXTRACTION_TOOL) +
 * samplingParamsFor(model) — invariants 2 & 3. The PDF is sent as a base64
 * document block. Injected into the worker as a `CallClaude` so the worker core
 * is unit-testable with a fixture response.
 */
import Anthropic from "@anthropic-ai/sdk"
import { EXTRACTION_TOOL, samplingParamsFor } from "../../../../shared/parse/parsePrompt.js"
import type { CallClaude } from "./parseTypes.js"

/** Build the real CallClaude bound to an API key. */
export function makeCallClaude(apiKey: string): CallClaude {
  const client = new Anthropic({ apiKey })
  return async ({ model, pdfBase64, prompt }) => {
    const res = await client.messages.create({
      model,
      max_tokens: 16000,
      ...samplingParamsFor(model),
      tools: [EXTRACTION_TOOL as unknown as Anthropic.Tool],
      tool_choice: { type: "tool", name: EXTRACTION_TOOL.name },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
            },
            { type: "text", text: prompt },
          ],
        },
      ],
    })
    // The SDK's content blocks are the shape extractParsedResult expects.
    return { content: res.content as Array<{ type: string; name?: string; input?: unknown; text?: string }> }
  }
}
