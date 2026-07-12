import {
  addDoc,
  collection,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc,
  Timestamp,
  type DocumentData,
} from "firebase/firestore"
import { db } from "@/integrations/firebase"
import type { ChatSource, ChatMessage } from "./chatService"

/**
 * Conversation history for Ask. Backed by `homes/{homeId}/chatConversations`
 * and its `messages` subcollection (firestore-model.md).
 *
 * GRACEFUL DEGRADATION: this feature is optional. Every call returns a "missing"
 * signal (`null` / `false`) instead of throwing on any error, so the Ask page
 * silently falls back to its in-memory single-thread behavior. Callers must
 * treat those results as "persistence is off" and never surface an error.
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

function convoIso(v: unknown): string {
  if (v instanceof Timestamp) return v.toDate().toISOString()
  return typeof v === "string" ? v : ""
}

/** Stored sources are camelCase (seed + our writes); curate to snake_case. */
function toSources(raw: unknown): ChatSource[] | null {
  if (!Array.isArray(raw)) return null
  return raw.map((s: DocumentData) => ({
    title: s.title ?? "",
    item_name: s.itemName ?? s.item_name ?? "",
    source_type: (s.sourceType ?? s.source_type ?? "manual") as ChatSource["source_type"],
    ...(s.url ? { url: s.url as string } : {}),
  }))
}

/** Curated ChatSource → stored camelCase shape. */
function fromSources(sources: ChatSource[] | null | undefined): DocumentData[] | null {
  if (!sources || sources.length === 0) return null
  return sources.map((s) => ({
    title: s.title,
    itemName: s.item_name,
    sourceType: s.source_type,
    url: s.url ?? null,
  }))
}

/**
 * Lists conversations for a home, most-recent first. Returns `null` on any
 * error so the caller falls back to in-memory mode.
 */
export async function listConversations(
  homeId: string
): Promise<ConversationSummary[] | null> {
  if (!homeId) return null
  try {
    const snap = await getDocs(collection(db, `homes/${homeId}/chatConversations`))
    return snap.docs
      .map((d) => {
        const x = d.data()
        return {
          id: d.id,
          title: x.title ?? "New question",
          created_at: convoIso(x.createdAt),
          updated_at: convoIso(x.updatedAt),
        }
      })
      .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""))
      .slice(0, 50)
  } catch {
    return null
  }
}

/**
 * Loads the messages of a conversation in chronological order. Returns `null`
 * if persistence is unavailable.
 */
export async function getConversationMessages(
  homeId: string,
  conversationId: string
): Promise<PersistedMessage[] | null> {
  if (!homeId || !conversationId) return null
  try {
    const snap = await getDocs(
      collection(db, `homes/${homeId}/chatConversations/${conversationId}/messages`)
    )
    return snap.docs
      .map((d) => {
        const x = d.data()
        return {
          id: d.id,
          role: (x.role ?? "user") as "user" | "assistant",
          content: x.content ?? "",
          sources: toSources(x.sources),
          created_at: convoIso(x.createdAt),
        }
      })
      .sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""))
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
    const now = serverTimestamp()
    const ref = await addDoc(collection(db, `homes/${homeId}/chatConversations`), {
      userId: userId ?? null,
      title: title.slice(0, 120) || "New question",
      createdAt: now,
      updatedAt: now,
    })
    return ref.id
  } catch {
    return null
  }
}

/**
 * Appends a message to a conversation. Best-effort: returns true on success,
 * false (without throwing) when persistence is unavailable.
 */
export async function appendMessage(
  homeId: string,
  conversationId: string,
  msg: { role: "user" | "assistant"; content: string; sources?: ChatSource[] | null }
): Promise<boolean> {
  if (!homeId || !conversationId) return false
  try {
    await addDoc(collection(db, `homes/${homeId}/chatConversations/${conversationId}/messages`), {
      role: msg.role,
      content: msg.content,
      sources: fromSources(msg.sources),
      createdAt: serverTimestamp(),
    })
    // Touch the parent so it sorts to the top of the rail.
    await touchConversation(homeId, conversationId)
    return true
  } catch {
    return false
  }
}

/** Renames a conversation. Best-effort. */
export async function renameConversation(
  homeId: string,
  conversationId: string,
  title: string
): Promise<boolean> {
  if (!homeId || !conversationId) return false
  try {
    await updateDoc(doc(db, `homes/${homeId}/chatConversations/${conversationId}`), {
      title: title.slice(0, 120) || "New question",
      updatedAt: serverTimestamp(),
    })
    return true
  } catch {
    return false
  }
}

/** Bumps updatedAt so the conversation sorts to the top. Best-effort. */
export async function touchConversation(homeId: string, conversationId: string): Promise<void> {
  if (!homeId || !conversationId) return
  try {
    await updateDoc(doc(db, `homes/${homeId}/chatConversations/${conversationId}`), {
      updatedAt: serverTimestamp(),
    })
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
