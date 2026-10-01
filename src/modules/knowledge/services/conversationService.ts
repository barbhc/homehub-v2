import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
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
 * NEVER THROWS, NEVER SILENT. Every call returns a "missing" signal (`null` /
 * `false`) instead of throwing, so a failed write never interrupts the answer
 * being streamed — and every failure is LOGGED here with the ids involved.
 *
 * The signal used to mean "persistence is off" (v1's table could be missing)
 * and the page was told never to surface it. In v2 the collection always
 * exists, so a null/false with real ids is a FAILURE: the Ask page says so
 * where the person would lose something — the Recent list, opening a past
 * conversation, and a conversation that could not be saved to history
 * (audit H6).
 */

/** One line per failed history read/write, with the ids needed to find it. */
function logFailure(what: string, e: unknown): void {
  console.warn(`[ask history] ${what}:`, e instanceof Error ? e.message : e)
}

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

/** How many conversations the rail shows — and now, how many are read. */
const RAIL_CONVERSATIONS = 50

/**
 * Lists conversations for a home, most-recent first. Returns `null` when the
 * read failed (logged) — never an empty list standing in for one.
 */
export async function listConversations(
  homeId: string
): Promise<ConversationSummary[] | null> {
  if (!homeId) return null
  try {
    // Only the rail's worth, newest first — a single-field order, so no
    // composite index. It used to read every conversation the home ever had
    // and cut the list to 50 here. (Every writer sets updatedAt, which the
    // order needs: a document without it would not be returned.)
    const snap = await getDocs(
      query(collection(db, `homes/${homeId}/chatConversations`), orderBy("updatedAt", "desc"), limit(RAIL_CONVERSATIONS))
    )
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
      // Conversations touched in the same instant (the seed writes three) keep
      // document-id order, as the whole-collection read returned them.
      .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? "") || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  } catch (e) {
    logFailure(`could not list conversations for home ${homeId}`, e)
    return null
  }
}

/**
 * Loads the messages of a conversation in chronological order. Returns `null`
 * when the read failed (logged).
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
  } catch (e) {
    logFailure(`could not load conversation ${conversationId} (home ${homeId})`, e)
    return null
  }
}

/**
 * Creates a new conversation. Returns the new id, or `null` when the write
 * failed (logged) — the answer still streams; the caller says it isn't saved.
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
  } catch (e) {
    logFailure(`could not create a conversation (home ${homeId})`, e)
    return null
  }
}

/**
 * Appends a message to a conversation. Returns true on success, false (logged,
 * never thrown) when the write failed.
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
  } catch (e) {
    logFailure(`could not save a ${msg.role} message to conversation ${conversationId} (home ${homeId})`, e)
    return false
  }
}

/** Renames a conversation. Returns false (logged) when the write failed. */
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
  } catch (e) {
    logFailure(`could not rename conversation ${conversationId} (home ${homeId})`, e)
    return false
  }
}

/**
 * Bumps updatedAt so the conversation sorts to the top. Logged, never thrown:
 * the message itself is already saved, so a failed bump costs only its place
 * in the Recent order.
 */
export async function touchConversation(homeId: string, conversationId: string): Promise<void> {
  if (!homeId || !conversationId) return
  try {
    await updateDoc(doc(db, `homes/${homeId}/chatConversations/${conversationId}`), {
      updatedAt: serverTimestamp(),
    })
  } catch (e) {
    logFailure(`could not move conversation ${conversationId} to the top of Recent (home ${homeId})`, e)
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
