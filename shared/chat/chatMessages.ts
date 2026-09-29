/**
 * Message assembly for chatQuery — pure, so vitest covers it.
 *
 * The manual PDFs are the bulk of every chat request (often 100K+ tokens), so
 * they go at the FRONT of the conversation — inside the first user turn — with
 * a prompt-cache breakpoint on the last one. Cache prefixes match left to
 * right, so system + PDFs are identical on every follow-up question and bill
 * at ~10% as cache reads. Appended to the latest turn (the old layout), the
 * prefix changed every turn and nothing could ever be cached.
 */

export type PdfDoc = {
  type: "document"
  source: { type: "base64"; media_type: "application/pdf"; data: string }
  title?: string
}

export type ChatContentBlock =
  | (PdfDoc & { cache_control?: { type: "ephemeral" } })
  | { type: "text"; text: string }

export type ChatMessage = {
  role: "user" | "assistant"
  content: string | ChatContentBlock[]
}

/** Text of the synthetic leading turn used when trimmed history opens on an assistant reply. */
export const PDF_ONLY_TURN_TEXT = "Attached: the owner's manual for this conversation."

export function buildChatMessages(
  history: ReadonlyArray<{ role: "user" | "assistant"; content: string }>,
  userText: string,
  pdfDocs: readonly PdfDoc[],
): ChatMessage[] {
  const messages: ChatMessage[] = [
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: [{ type: "text", text: userText }] },
  ]
  if (pdfDocs.length === 0) return messages

  const cachedPdfs: ChatContentBlock[] = pdfDocs.map((d, i) =>
    i === pdfDocs.length - 1 ? { ...d, cache_control: { type: "ephemeral" } } : d,
  )
  const first = messages[0]
  if (first.role === "user") {
    const firstBlocks: ChatContentBlock[] =
      typeof first.content === "string" ? [{ type: "text", text: first.content }] : first.content
    messages[0] = { role: "user", content: [...cachedPdfs, ...firstBlocks] }
  } else {
    // Roles must alternate starting with user: give the PDFs their own turn.
    messages.unshift({ role: "user", content: [...cachedPdfs, { type: "text", text: PDF_ONLY_TURN_TEXT }] })
  }
  return messages
}
