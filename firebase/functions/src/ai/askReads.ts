/**
 * What one Ask question reads, and how much of it (audit 2026-09-29, B, Part 5
 * item 7): chatQuery read every care note and every room for every question,
 * every manual in the home, and up to 40 chunks from EACH in-scope manual — a
 * whole-home question over 25 manuals was ~1,100 document reads before Claude
 * saw a word.
 *
 * Now:
 *  · chunk candidates are capped at CHUNK_READ_BUDGET per question
 *    (planChunkReads), and the existing ranking (chunkRanking.ts) still picks
 *    the MAX_CHUNKS that reach the prompt;
 *  · notes are read only as far as the scope reaches, rooms only when a room
 *    note needs its name (readAskNotes), manuals only for the items in scope
 *    (readScopedManuals) — each producing the list the whole-collection read
 *    produced, in the same order;
 *  · every read is counted (ReadTally) and chatQuery logs the total as
 *    `docsRead`, per question.
 *
 * Nothing here touches the prompt: what reaches Claude is built exactly as
 * before from what these return.
 */
import type { Firestore, Query, QueryDocumentSnapshot } from "firebase-admin/firestore"
import { queryTerms, scoreChunk } from "./chunkRanking.js"
import type { NoteInput, NoteScopeKind } from "./notesContext.js"

/** Most chunk candidates one question may read, across all its manuals. */
export const CHUNK_READ_BUDGET = 120
/** Most chunk candidates read from one manual (the per-manual cap before this budget). */
export const CANDIDATES_PER_MANUAL = 40
/** Firestore's `in` takes at most 30 values per query. */
const IN_MAX = 30

export type ReadKind = "member" | "items" | "notes" | "rooms" | "manuals" | "chunks"

/** Document reads per collection, as Firestore bills them: a query that returns nothing still costs one. */
export class ReadTally {
  readonly reads: Record<ReadKind, number> = { member: 0, items: 0, notes: 0, rooms: 0, manuals: 0, chunks: 0 }
  query(kind: ReadKind, returned: number): void {
    this.reads[kind] += Math.max(returned, 1)
  }
  docs(kind: ReadKind, n: number): void {
    this.reads[kind] += n
  }
  get docsRead(): number {
    return Object.values(this.reads).reduce((a, b) => a + b, 0)
  }
}

export type AskOutcome = "answered" | "failed" | "nothing-to-ask" | "refused"

/** The structured line chatQuery logs once per question ("chatQuery reads"). */
export function askReadsLogFields(homeId: string, scope: string, outcome: AskOutcome, tally: ReadTally) {
  return { homeId, scope, outcome, docsRead: tally.docsRead, ...tally.reads }
}

const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

function inBatches<T>(values: T[]): T[][] {
  const out: T[][] = []
  for (let i = 0; i < values.length; i += IN_MAX) out.push(values.slice(i, i + IN_MAX))
  return out
}

/** Runs the queries, tallies them, and returns their documents as ONE list in document-id order — the order a single read of the collection returns. */
async function union(queries: Query[], tally: ReadTally, kind: ReadKind): Promise<QueryDocumentSnapshot[]> {
  const snaps = await Promise.all(queries.map((q) => q.get()))
  const seen = new Map<string, QueryDocumentSnapshot>()
  for (const s of snaps) {
    tally.query(kind, s.size)
    for (const d of s.docs) seen.set(d.id, d)
  }
  return [...seen.values()].sort(byId)
}

/**
 * How many chunk candidates to read from each manual, aligned with `manuals`
 * (0 = none). Within CHUNK_READ_BUDGET every manual gets its full
 * CANDIDATES_PER_MANUAL, exactly as before. Past it:
 *  1. manuals whose ITEM the question names ("my furnace") share the budget
 *     first, best match first — the ranking scores a chunk's item name above
 *     its body, so these are the manuals whose chunks win;
 *  2. whatever is left is split evenly across the rest, in manual order.
 * Never more than `budget` in total.
 */
export function planChunkReads(
  question: string,
  manuals: Array<{ itemUnitId: string }>,
  itemText: (itemUnitId: string) => string,
  budget: number = CHUNK_READ_BUDGET,
  perManual: number = CANDIDATES_PER_MANUAL,
): number[] {
  if (manuals.length * perManual <= budget) return manuals.map(() => perManual)
  const terms = queryTerms(question)
  const scored = manuals.map((m, i) => ({
    i,
    s: terms.length === 0 ? 0 : scoreChunk(terms, { strong: itemText(m.itemUnitId).toLowerCase(), body: "" }),
  }))
  const limits = manuals.map(() => 0)
  const share = (indices: number[], total: number) => {
    const base = Math.floor(total / indices.length)
    const extra = total % indices.length
    indices.forEach((i, j) => {
      limits[i] = Math.min(perManual, base + (j < extra ? 1 : 0))
    })
  }
  const named = scored.filter((x) => x.s > 0).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.i)
  if (named.length > 0) share(named, budget)
  const left = budget - limits.reduce((a, b) => a + b, 0)
  const rest = scored.filter((x) => x.s === 0).map((x) => x.i)
  if (left > 0 && rest.length > 0) share(rest, left)
  return limits
}

/** One chunk candidate, as the ranking sees it. */
export type ChunkCandidate = { id: string; title: string | null; content: string; displayName: string; strong: string; body: string }

/**
 * Chunk candidates from the in-scope manuals, read per planChunkReads, in
 * manual order — the order rankChunks breaks ties by.
 */
export async function readChunkCandidates(
  db: Firestore,
  homeId: string,
  question: string,
  manuals: Array<{ manualId: string; itemUnitId: string }>,
  items: { name: (itemUnitId: string) => string | undefined; category: (itemUnitId: string) => string | null | undefined },
  preferredTypes: string[],
  tally: ReadTally,
): Promise<ChunkCandidate[]> {
  const limits = planChunkReads(question, manuals, (id) => `${items.name(id) ?? ""} ${items.category(id) ?? ""}`)
  const perManual = await Promise.all(
    manuals.map(async (m, i): Promise<ChunkCandidate[]> => {
      if (limits[i] === 0) return []
      const cs = await db
        .collection(`homes/${homeId}/manuals/${m.manualId}/chunks`)
        .where("deletedAt", "==", null)
        .where("chunkType", "in", preferredTypes)
        .limit(limits[i])
        .get()
      tally.query("chunks", cs.size)
      const displayName = items.name(m.itemUnitId) ?? "Unknown"
      return cs.docs.map((c) => {
        const title = (c.get("title") as string | null) ?? null
        const content = (c.get("content") as string) ?? ""
        const tags = (c.get("tags") as string[] | undefined) ?? []
        const scenarios = (c.get("scenarios") as string[] | undefined) ?? []
        const appliesTo = (c.get("appliesTo") as string[] | undefined) ?? []
        const sectionCategory = (c.get("sectionCategory") as string | null) ?? ""
        const strong = [displayName, title ?? "", sectionCategory, ...tags, ...scenarios, ...appliesTo]
          .join(" ")
          .toLowerCase()
        return { id: c.id, title, content, displayName, strong, body: content.toLowerCase() }
      })
    })
  )
  return perManual.flat()
}

/**
 * The manuals of the items in scope — all of the home's for a whole-home
 * question, otherwise only those items' (`in` batches of 30) — in
 * document-id order, as the single read returned them.
 */
export async function readScopedManuals(
  db: Firestore,
  homeId: string,
  wholeHome: boolean,
  scopedIds: Set<string>,
  tally: ReadTally,
): Promise<QueryDocumentSnapshot[]> {
  const live = db.collection(`homes/${homeId}/manuals`).where("deletedAt", "==", null)
  const queries = wholeHome ? [live] : inBatches([...scopedIds]).map((ids) => live.where("itemUnitId", "in", ids))
  return union(queries, tally, "manuals")
}

/**
 * The household's notes Ask may use — the house's, the in-scope rooms' and the
 * in-scope items' — as the NoteInput list the whole-collection read built, in
 * the same order (pickNotes breaks ties by position). The item's legacy
 * single `notes` text is the caller's: it lives on the item docs in hand.
 *
 * A whole-home question reads every note, as before. A scoped one reads the
 * house's notes plus those of its rooms and items only. Rooms are read only
 * when a room note could be shown — for a scoped question just those rooms,
 * by id.
 */
export async function readAskNotes(
  db: Firestore,
  ask: {
    homeId: string
    wholeHome: boolean
    scopedItems: Array<{ id: string; roomId: string | null }>
    scopedIds: Set<string>
    nameByItem: Map<string, string>
  },
  tally: ReadTally,
): Promise<NoteInput[]> {
  const notesCol = db.collection(`homes/${ask.homeId}/careNotes`).where("deletedAt", "==", null)
  const scopedRoomIds = [...new Set(ask.scopedItems.map((i) => i.roomId).filter((r): r is string => !!r))]
  const notes = await union(
    ask.wholeHome
      ? [notesCol]
      : [
          notesCol.where("scope", "==", "home"),
          ...inBatches(scopedRoomIds).map((ids) => notesCol.where("roomId", "in", ids)),
          ...inBatches([...ask.scopedIds]).map((ids) => notesCol.where("itemUnitId", "in", ids)),
        ],
    tally,
    "notes",
  )

  // Rooms, only when a room note could be shown: they label it, and for a
  // whole-home question they decide it (a note on a deleted room is dropped).
  const text = (d: QueryDocumentSnapshot) => ((d.get("content") as string | null) ?? "").trim()
  const roomNoteIds = new Set(
    notes
      .filter((d) => d.get("scope") === "room" && text(d))
      .map((d) => d.get("roomId") as string | null)
      .filter((r): r is string => !!r && (ask.wholeHome || scopedRoomIds.includes(r))),
  )
  const roomName = new Map<string, string>()
  if (roomNoteIds.size > 0 && ask.wholeHome) {
    // The live rooms, as before — never more than the old read.
    const rooms = await db.collection(`homes/${ask.homeId}/rooms`).where("deletedAt", "==", null).get()
    tally.query("rooms", rooms.size)
    for (const r of rooms.docs) roomName.set(r.id, (r.get("name") as string | null) ?? "Room")
  } else if (roomNoteIds.size > 0) {
    // Just the scoped rooms that have a note, by id. `deletedAt === null`, not
    // `== null`: the old where("deletedAt", "==", null) never matched a room
    // with no deletedAt field at all.
    const rooms = await db.getAll(...[...roomNoteIds].map((id) => db.doc(`homes/${ask.homeId}/rooms/${id}`)))
    tally.docs("rooms", rooms.length)
    for (const r of rooms) if (r.exists && r.get("deletedAt") === null) roomName.set(r.id, (r.get("name") as string | null) ?? "Room")
  }
  const roomsInScope = ask.wholeHome ? new Set(roomName.keys()) : new Set(scopedRoomIds)

  const out: NoteInput[] = []
  for (const d of notes) {
    const scope = d.get("scope") as NoteScopeKind
    const content = (d.get("content") as string | null) ?? ""
    const title = (d.get("title") as string | null) ?? null
    if (!content.trim()) continue
    if (scope === "home") {
      out.push({ scope, scopeLabel: "House", title, content })
    } else if (scope === "room") {
      const roomId = d.get("roomId") as string | null
      if (roomId && roomsInScope.has(roomId)) out.push({ scope, scopeLabel: roomName.get(roomId) ?? "Room", title, content })
    } else if (scope === "item_unit") {
      const itemId = d.get("itemUnitId") as string | null
      if (itemId && ask.scopedIds.has(itemId)) out.push({ scope, scopeLabel: ask.nameByItem.get(itemId) ?? "Item", title, content })
    }
  }
  return out
}
