import { supabase } from "@/integrations/shim/client"
import type { ChatSource, ChatMessage } from "./chatService"

/**
 * Conversation history for Ask. Backed by the `conversation` /
 * `conversation_message` tables (migration 20260623000001).
 *
 * GRACEFUL DEGRADATION: this feature is optional. If the migration has not been
 * applied to the database yet, every call here returns a "missing" signal
 * instead of throwing, so the Ask page silently falls back to its existing
 * in-memory single-thread behavior. Callers must treat `null` / `unavailable`
 * results as "persistence is off" and never surface an error.
 */

export type ConversationSummary = {
  id: string
  title: string
  created_at: string
  updated_at: string
}

export type PersistedMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  sources: ChatSource[] | null
  created_at: string
}

/** PostgREST codes that mean "the table/relation isn't there". */
function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  // 42P01 = undefined_table (Postgres), PGRST205 = table not found in schema cache.
  const code = error.code ?? ""
  if (code === "42P01" || code === "PGRST205" || code === "PGRST204") return true
  const msg = (error.message ?? "").toLowerCase()
  return (
    msg.includes("does not exist") ||
    msg.includes("not found") ||
    msg.includes("schema cache")
  )
}

/**
 * Lists conversations for a home, most-recent first. Returns `null` when
 * persistence is unavailable (table missing or any query error) so the caller
 * can fall back to in-memory mode.
 */
export async function listConversations(
  homeId: string
): Promise<ConversationSummary[] | null> {
  if (!homeId) return null
  try {
    const { data, error } = await supabase
      .from("conversation")
      .select("id, title, created_at, updated_at")
      .eq("home_id", homeId)
      .order("updated_at", { ascending: false })
      .limit(50)
    if (error) {
      if (isMissingTable(error)) return null
      return null
    }
    return (data ?? []) as ConversationSummary[]
  } catch {
    return null
  }
}

/**
 * Loads the messages of a conversation in chronological order. Returns `null`
 * if persistence is unavailable.
 */
export async function getConversationMessages(
  conversationId: string
): Promise<PersistedMessage[] | null> {
  if (!conversationId) return null
  try {
    const { data, error } = await supabase
      .from("conversation_message")
      .select("id, role, content, sources, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
    if (error) return null
    return (data ?? []) as PersistedMessage[]
  } catch {
    return null
  }
}

/**
 * Creates a new conversation. Returns the new id, or `null` if persistence is
 * unavailable (caller proceeds in-memory).
 */
export async function createConversation(
  homeId: string,
  userId: string | null,
  title: string
): Promise<string | null> {
  if (!homeId) return null
  try {
    const { data, error } = await supabase
      .from("conversation")
      .insert({ home_id: homeId, user_id: userId, title: title.slice(0, 120) || "New question" })
      .select("id")
      .single()
    if (error) return null
    return (data as { id: string }).id
  } catch {
    return null
  }
}

/**
 * Appends a message to a conversation. Best-effort: returns true on success,
 * false (without throwing) when persistence is unavailable.
 */
export async function appendMessage(
  conversationId: string,
  msg: { role: "user" | "assistant"; content: string; sources?: ChatSource[] | null }
): Promise<boolean> {
  if (!conversationId) return false
  try {
    const { error } = await supabase.from("conversation_message").insert({
      conversation_id: conversationId,
      role: msg.role,
      content: msg.content,
      sources: msg.sources ?? null,
    })
    if (error) return false
    // Touch the parent so it sorts to the top of the rail.
    await touchConversation(conversationId)
    return true
  } catch {
    return false
  }
}

/** Renames a conversation. Best-effort. */
export async function renameConversation(
  conversationId: string,
  title: string
): Promise<boolean> {
  if (!conversationId) return false
  try {
    const { error } = await supabase
      .from("conversation")
      .update({ title: title.slice(0, 120) || "New question" })
      .eq("id", conversationId)
    return !error
  } catch {
    return false
  }
}

/** Bumps updated_at so the conversation sorts to the top. Best-effort. */
export async function touchConversation(conversationId: string): Promise<void> {
  if (!conversationId) return
  try {
    await supabase
      .from("conversation")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId)
  } catch {
    /* ignore — persistence optional */
  }
}

/** Maps persisted rows into the in-memory ChatMessage shape used by the thread. */
export function toChatMessages(rows: PersistedMessage[]): ChatMessage[] {
  return rows.map((r) => ({
    id: r.id,
    role: r.role,
    content: r.content,
    sources: r.sources ?? undefined,
  }))
}
