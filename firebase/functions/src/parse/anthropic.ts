/**
 * Production Claude extraction call. The request comes from
 * buildExtractionRequest(model): forced EXTRACTION_TOOL + samplingParamsFor
 * (invariants 2 & 3) on Sonnet/Haiku; on Opus 5.5, which rejects forced
 * tool_choice, the same tool under tool_choice "auto" with a check that the
 * call happened (see buildExtractionRequest for why not structured outputs).
 * The PDF is sent as a base64 document block. Injected into the worker as a
 * `CallClaude` so the worker core is unit-testable with a fixture response.
 */
import Anthropic from "@anthropic-ai/sdk"
import { buildExtractionRequest, extractionContent, NoToolCallError } from "../../../../shared/parse/parsePrompt.js"
import type { CallClaude } from "./parseTypes.js"

/** Unforced tool calls get one retry when the model answers without the tool. */
const MAX_ATTEMPTS_UNFORCED = 2

/** Build the real CallClaude bound to an API key. */
export function makeCallClaude(apiKey: string): CallClaude {
  const client = new Anthropic({ apiKey })
  return async ({ model, pdfBase64, prompt }) => {
    const req = buildExtractionRequest(model, pdfBase64, prompt)
    const attempts = req.toolCallUnforced ? MAX_ATTEMPTS_UNFORCED : 1
    for (let attempt = 1; ; attempt++) {
      // Outgoing request body built by the shared builder; the SDK version
      // pinned here predates the `fallbacks` field, hence the assertions.
      const res = req.betas.length
        ? req.stream
          ? await client.beta.messages
              .stream({ ...req.params, betas: req.betas } as unknown as Anthropic.Beta.MessageCreateParamsNonStreaming)
              .finalMessage()
          : await client.beta.messages.create({ ...req.params, betas: req.betas } as unknown as Anthropic.Beta.MessageCreateParamsNonStreaming)
        : req.stream
          ? await client.messages.stream(req.params as unknown as Anthropic.MessageCreateParamsNonStreaming).finalMessage()
          : await client.messages.create(req.params as unknown as Anthropic.MessageCreateParamsNonStreaming)
      try {
        // The SDK's content blocks are the shape extractParsedResult expects.
        return extractionContent(
          res as { stop_reason?: string | null; content?: Array<{ type: string; name?: string; input?: unknown; text?: string }> },
          req.toolCallUnforced,
        )
      } catch (e) {
        if (e instanceof NoToolCallError && attempt < attempts) {
          console.warn(`[parse] ${model} answered without the extraction tool (attempt ${attempt}); retrying`)
          continue
        }
        throw e
      }
    }
  }
}
