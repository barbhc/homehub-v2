import { type Dispatch, type SetStateAction, useState, useEffect, useMemo } from "react"
import { Link } from "react-router-dom"
import {
  ChevronRightIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react"
import { PageContainer, PageHeader, SectionCard, EmptyState } from "@/components/layout"
import { FilterTabs } from "@/components/layout/FilterTabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useCurrentHome, getRooms } from "@/modules/home"
import { getItemUnits } from "@/modules/items"
import {
  getCareNotesByScope,
  getCareNotesByHome,
  createCareNote,
  deleteCareNote,
} from "@/modules/care"
import {
  getKnowledgeChunksByHome,
  getFaqsByHome,
  deleteFaq,
  type ChunkWithItemMeta,
} from "@/modules/knowledge"
import type { ChatFaq, CareNote, CareNoteScope } from "@/integrations/types"
import { AddNoteSheet } from "@/components/care/AddNoteSheet"
import { supabase } from "@/integrations/shim/client"
import { cn } from "@/lib/utils"

type Tab = "house" | "rooms" | "items" | "saved"
type GroupBy = "item" | "category" | "room"
type ChunkTypeFilter = "all" | "care" | "how_to" | "troubleshooting"
type SuggestionItem = {
  id: string
  title: string
  content: string
  chunk_type: string
  category?: string
}
type AddNoteContext = {
  scope: CareNoteScope
  roomId?: string | null
  roomName?: string | null
  itemUnitId?: string | null
  itemName?: string | null
}

const TYPE_CONFIG = {
  care: {
    label: "Care",
    colorClass: "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-400",
    textClass: "text-sky-700 dark:text-sky-400",
    dotClass: "bg-sky-500",
  },
  how_to: {
    label: "How To",
    colorClass: "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-400",
    textClass: "text-violet-700 dark:text-violet-400",
    dotClass: "bg-violet-500",
  },
  troubleshooting: {
    label: "Troubleshooting",
    colorClass: "bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-400",
    textClass: "text-orange-700 dark:text-orange-400",
    dotClass: "bg-orange-500",
  },
} as const

const TYPES_ORDER = ["care", "how_to", "troubleshooting"] as const

function chunksByType(items: ChunkWithItemMeta[]) {
  const byType: Record<string, ChunkWithItemMeta[]> = {}
  for (const c of items) {
    const t = c.chunk_type
    if (!byType[t]) byType[t] = []
    byType[t].push(c)
  }
  return byType
}

function notesByType(notes: CareNote[]) {
  const byType: Record<string, CareNote[]> = {}
  for (const n of notes) {
    if (!byType[n.chunk_type]) byType[n.chunk_type] = []
    byType[n.chunk_type].push(n)
  }
  return byType
}

function toggleSet(set: Set<string>, key: string) {
  const next = new Set(set)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  return next
}

function SourceBadge({
  source,
  sourceUrl,
}: {
  source: CareNote["source"]
  sourceUrl?: string | null
}) {
  if (source === "user") {
    return (
      <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 shrink-0">
        You
      </span>
    )
  }
  if (source === "ai") {
    return (
      <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-400 shrink-0">
        AI
      </span>
    )
  }
  if (sourceUrl) {
    return (
      <a
        href={sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[9px] font-bold px-1 py-0.5 rounded bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-400 shrink-0"
      >
        Web ↗
      </a>
    )
  }
  return (
    <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
      Web
    </span>
  )
}

function SuggestionCards({
  suggestions,
  onDismiss,
  onSave,
}: {
  suggestions: SuggestionItem[]
  onDismiss: (id: string) => void
  onSave: (s: SuggestionItem) => Promise<void>
}) {
  if (suggestions.length === 0) return null
  return (
    <div className="space-y-2 mb-4">
      {suggestions.map((s) => (
        <div
          key={s.id}
          className="p-3 rounded-lg border border-dashed border-border bg-muted/40"
        >
          <div className="text-xs text-muted-foreground mb-1">
            ✨ AI Suggestion · {s.chunk_type}
            {s.category ? ` · ${s.category}` : ""}
          </div>
          <div className="text-sm font-medium">{s.title}</div>
          <p className="text-sm text-muted-foreground mt-1">
            {s.content.length > 120 ? s.content.slice(0, 120) + "…" : s.content}
          </p>
          <div className="flex gap-2 mt-2 justify-end">
            <Button size="sm" variant="ghost" onClick={() => onDismiss(s.id)}>
              Dismiss
            </Button>
            <Button size="sm" onClick={() => onSave(s)}>
              Save tip
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}

interface ItemRowProps {
  itemUnitId: string
  itemName: string
  items: ChunkWithItemMeta[]
  careNotes: CareNote[]
  typeFilter: ChunkTypeFilter
  expandedItems: Set<string>
  expandedTypes: Set<string>
  setExpandedItems: Dispatch<SetStateAction<Set<string>>>
  setExpandedTypes: Dispatch<SetStateAction<Set<string>>>
  onDeleteCareNote: (noteId: string) => void
  onAddCareNote: () => void
  itemCategory: string | null
  isSuggesting: boolean
  itemSuggestions: SuggestionItem[]
  itemSuggestError: string | null
  onSuggestCareNote: () => void
  onDismissSuggestion: (id: string) => void
  onSaveSuggestion: (s: SuggestionItem) => Promise<void>
}

function ItemRow({
  itemUnitId,
  itemName,
  items,
  careNotes,
  typeFilter,
  expandedItems,
  expandedTypes,
  setExpandedItems,
  setExpandedTypes,
  onDeleteCareNote,
  onAddCareNote,
  isSuggesting,
  itemSuggestions,
  itemSuggestError,
  onSuggestCareNote,
  onDismissSuggestion,
  onSaveSuggestion,
}: ItemRowProps) {
  const byType = chunksByType(items)
  const careByType = notesByType(careNotes)
  const isExpanded = expandedItems.has(itemUnitId)
  const itemKey = itemUnitId

  const chips = TYPES_ORDER.filter((t) => {
    if (typeFilter !== "all" && typeFilter !== t) return false
    return (byType[t] ?? []).length > 0 || (careByType[t] ?? []).length > 0
  }).map((t) => (
    <span
      key={t}
      className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded", TYPE_CONFIG[t].colorClass)}
    >
      {TYPE_CONFIG[t].label} {(byType[t] ?? []).length + (careByType[t] ?? []).length}
    </span>
  ))

  return (
    <div className={cn("border rounded-lg overflow-hidden bg-background mb-1.5", "border-border")}>
      <button
        type="button"
        onClick={() => setExpandedItems((prev) => toggleSet(prev, itemUnitId))}
        className="flex items-center gap-2.5 w-full py-2.5 px-3.5 text-left hover:bg-muted/40 transition-colors"
      >
        <ChevronRightIcon
          className={cn(
            "size-3.5 text-muted-foreground shrink-0 transition-transform",
            isExpanded && "rotate-90"
          )}
        />
        <span className="text-sm font-semibold flex-1 min-w-0 truncate">{itemName}</span>
        <div className="flex gap-1 shrink-0">{chips}</div>
      </button>
      {isExpanded && (
        <div className="border-t border-border">
          <div className="flex items-center justify-between py-1.5 px-3 bg-muted/30 border-b border-border">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onAddCareNote}
                className="text-[11px] font-bold text-teal-600 dark:text-teal-400 hover:underline"
              >
                + Add tip
              </button>
              <button
                type="button"
                onClick={onSuggestCareNote}
                disabled={isSuggesting}
                className="text-[11px] font-bold text-violet-600 dark:text-violet-400 hover:underline disabled:opacity-50"
              >
                {isSuggesting ? "Suggesting…" : "✨ Suggest"}
              </button>
            </div>
            <Link
              to={`/items/${itemUnitId}`}
              className="text-[11px] font-bold text-teal-600 dark:text-teal-400 hover:underline"
            >
              View item ↗
            </Link>
          </div>
          {itemSuggestError && (
            <p className="text-xs text-destructive px-3.5 pt-2">{itemSuggestError}</p>
          )}
          {itemSuggestions.length > 0 && (
            <div className="px-3 pt-3">
              <SuggestionCards
                suggestions={itemSuggestions}
                onDismiss={onDismissSuggestion}
                onSave={onSaveSuggestion}
              />
            </div>
          )}
          {TYPES_ORDER.map((type) => {
            const manualList = byType[type] ?? []
            const noteList = careByType[type] ?? []
            if (manualList.length === 0 && noteList.length === 0) return null
            if (typeFilter !== "all" && typeFilter !== type) return null
            const typeKey = `${itemKey}-${type}`
            const typeExpanded = expandedTypes.has(typeKey)
            const cfg = TYPE_CONFIG[type]
            return (
              <div key={type} className="border-b border-border last:border-b-0">
                <button
                  type="button"
                  onClick={() => setExpandedTypes((prev) => toggleSet(prev, typeKey))}
                  className="flex items-center gap-2 w-full py-2 px-3.5 text-left hover:bg-muted/40 transition-colors"
                >
                  <ChevronRightIcon
                    className={cn(
                      "size-3 text-muted-foreground shrink-0 transition-transform",
                      typeExpanded && "rotate-90"
                    )}
                  />
                  <span className={cn("text-[11px] font-bold uppercase tracking-wide", cfg.textClass)}>
                    {cfg.label}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground font-normal">
                    {manualList.length + noteList.length}
                  </span>
                </button>
                {typeExpanded && (
                  <div className="pl-3 pb-3 pr-3">
                    <ul className="space-y-2 list-none p-0 m-0">
                      {manualList.map((c) => (
                        <li
                          key={c.chunk_id}
                          className="text-sm text-muted-foreground leading-relaxed flex items-start gap-2"
                        >
                          <div className="flex-1">
                            {c.title && (
                              <span className="font-medium text-foreground">{c.title}{" "}</span>
                            )}
                            <span>{c.content}</span>
                          </div>
                          <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-muted text-muted-foreground shrink-0 mt-0.5">
                            Manual
                          </span>
                        </li>
                      ))}
                      {noteList.map((n) => (
                        <li
                          key={n.note_id}
                          className="text-sm text-muted-foreground leading-relaxed flex items-start gap-2"
                        >
                          <div className="flex-1">
                            {n.title && (
                              <span className="font-medium text-foreground">{n.title}{" "}</span>
                            )}
                            <span>{n.content}</span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0 mt-0.5">
                            <SourceBadge source={n.source} sourceUrl={n.source_url} />
                            <button
                              type="button"
                              onClick={() => onDeleteCareNote(n.note_id)}
                              className="text-muted-foreground hover:text-destructive transition-colors"
                              aria-label="Delete tip"
                            >
                              <Trash2Icon className="size-3" />
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function FaqPage() {
  const { home } = useCurrentHome()
  const homeId = home?.home_id ?? ""
  const [tab, setTab] = useState<Tab>("items")
  const [chunks, setChunks] = useState<ChunkWithItemMeta[]>([])
  const [itemCareNotes, setItemCareNotes] = useState<Record<string, CareNote[]>>({})
  const [faqs, setFaqs] = useState<ChatFaq[]>([])
  const [itemNamesById, setItemNamesById] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [groupBy, setGroupBy] = useState<GroupBy>("item")
  const [typeFilter, setTypeFilter] = useState<ChunkTypeFilter>("all")
  const [search, setSearch] = useState("")
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set())
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [houseNotes, setHouseNotes] = useState<CareNote[]>([])
  const [roomNotes, setRoomNotes] = useState<CareNote[]>([])
  const [rooms, setRooms] = useState<Array<{ room_id: string; name: string }>>([])
  // Unified add-note sheet context
  const [addNoteContext, setAddNoteContext] = useState<AddNoteContext | null>(null)
  // Unified suggest state: keyed by 'house' or room_id or item_unit_id
  const [suggestingId, setSuggestingId] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<Record<string, SuggestionItem[]>>({})
  const [suggestErrors, setSuggestErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!homeId) {
      setChunks([])
      setFaqs([])
      setHouseNotes([])
      setRoomNotes([])
      setLoading(false)
      return
    }
    setLoading(true)
    if (tab === "items") {
      Promise.all([
        getKnowledgeChunksByHome(homeId, ["care", "how_to", "troubleshooting"]),
        getCareNotesByHome(homeId),
      ]).then(([chunksRes, careRes]) => {
        setChunks(chunksRes.data ?? [])
        const byItem: Record<string, CareNote[]> = {}
        for (const n of careRes.data ?? []) {
          const id = n.item_unit_id ?? ""
          if (!id) continue
          if (!byItem[id]) byItem[id] = []
          byItem[id].push(n)
        }
        setItemCareNotes(byItem)
        setLoading(false)
      })
    } else if (tab === "house") {
      getCareNotesByScope(homeId, "home").then((r) => {
        setHouseNotes(r.data ?? [])
        setLoading(false)
      })
    } else if (tab === "rooms") {
      Promise.all([
        getCareNotesByScope(homeId, "room"),
        getRooms(homeId),
      ]).then(([notesRes, roomsRes]) => {
        setRoomNotes(notesRes.data ?? [])
        setRooms((roomsRes.data ?? []) as Array<{ room_id: string; name: string }>)
        setLoading(false)
      })
    } else {
      Promise.all([getFaqsByHome(homeId), getItemUnits(homeId)]).then(
        ([faqRes, itemsRes]) => {
          setFaqs(faqRes.data ?? [])
          const names: Record<string, string> = {}
          ;(itemsRes.data ?? []).forEach(
            (i: { item_unit_id: string; display_name: string }) => {
              names[i.item_unit_id] = i.display_name
            }
          )
          setItemNamesById(names)
          setLoading(false)
        }
      )
    }
  }, [homeId, tab])

  const filteredChunks = useMemo(() => {
    return chunks.filter((c) => {
      const matchesType = typeFilter === "all" || c.chunk_type === typeFilter
      const matchesSearch =
        !search ||
        c.item_name.toLowerCase().includes(search.toLowerCase()) ||
        (c.title ?? "").toLowerCase().includes(search.toLowerCase()) ||
        c.content.toLowerCase().includes(search.toLowerCase())
      return matchesType && matchesSearch
    })
  }, [chunks, typeFilter, search])

  useEffect(() => {
    const keys = new Set<string>()
    if (groupBy === "item") {
      for (const c of filteredChunks) keys.add(c.item_unit_id || "__unknown__")
    } else if (groupBy === "category") {
      for (const c of filteredChunks) keys.add(c.item_category ?? "Uncategorized")
    } else {
      for (const c of filteredChunks) keys.add(c.room_name ?? "No Room")
    }
    setExpandedGroups(keys)
  }, [groupBy, filteredChunks])

  const handleDeleteFaq = async (faqId: string) => {
    const result = await deleteFaq(homeId, faqId)
    if (!result.error) setFaqs((prev) => prev.filter((f) => f.faq_id !== faqId))
  }

  const handleDeleteItemCareNote = (itemUnitId: string, noteId: string) => {
    deleteCareNote(homeId, noteId).then((r) => {
      if (!r.error) {
        setItemCareNotes((prev) => ({
          ...prev,
          [itemUnitId]: (prev[itemUnitId] ?? []).filter((n) => n.note_id !== noteId),
        }))
      }
    })
  }

  const handleNoteSaved = (note: CareNote) => {
    if (note.scope === "home") {
      setHouseNotes((prev) => [note, ...prev])
    } else if (note.scope === "room" && note.room_id) {
      setRoomNotes((prev) => [note, ...prev])
    } else if (note.scope === "item_unit" && note.item_unit_id) {
      setItemCareNotes((prev) => ({
        ...prev,
        [note.item_unit_id!]: [note, ...(prev[note.item_unit_id!] ?? [])],
      }))
    }
    setAddNoteContext(null)
  }

  const handleSuggest = async (
    scopeKey: string,
    scope: CareNoteScope,
    context: Record<string, unknown>
  ) => {
    setSuggestingId(scopeKey)
    setSuggestErrors((prev) => { const next = { ...prev }; delete next[scopeKey]; return next })
    setSuggestions((prev) => ({ ...prev, [scopeKey]: [] }))
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const res = await supabase.functions.invoke("suggest-care-notes", {
        body: { scope, context },
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : undefined,
      })
      if (res.error) throw new Error(res.error.message ?? "Function error")
      const body = res.data as { error?: string; suggestions?: Array<Omit<SuggestionItem, "id">> }
      if (body?.error) throw new Error(body.error)
      const withIds = (Array.isArray(body?.suggestions) ? body.suggestions : []).map(
        (s, i) => ({ ...s, id: `${Date.now()}-${i}` })
      )
      setSuggestions((prev) => ({ ...prev, [scopeKey]: withIds }))
    } catch (e) {
      setSuggestErrors((prev) => ({
        ...prev,
        [scopeKey]: e instanceof Error ? e.message : "Failed to generate suggestions",
      }))
    } finally {
      setSuggestingId(null)
    }
  }

  const dismissSuggestion = (scopeKey: string, id: string) => {
    setSuggestions((prev) => ({
      ...prev,
      [scopeKey]: (prev[scopeKey] ?? []).filter((s) => s.id !== id),
    }))
  }

  const saveSuggestion = async (
    scopeKey: string,
    s: SuggestionItem,
    extra: Partial<Parameters<typeof createCareNote>[0]>
  ) => {
    const cr = await createCareNote({
      home_id: homeId,
      scope: extra.scope ?? "home",
      chunk_type: (["care", "how_to", "troubleshooting"].includes(s.chunk_type)
        ? s.chunk_type
        : "care") as CareNote["chunk_type"],
      title: s.title,
      content: s.content,
      source: "ai",
      category: s.category ?? null,
      ...extra,
    })
    if (!cr.error && cr.data) {
      handleNoteSaved(cr.data)
      dismissSuggestion(scopeKey, s.id)
    }
  }

  const faqsWithItemNames = faqs.reduce<Record<string, ChatFaq[]>>((acc, faq) => {
    const key = faq.item_unit_id ?? "__general__"
    if (!acc[key]) acc[key] = []
    acc[key].push(faq)
    return acc
  }, {})

  const groupedByItem = useMemo(() => {
    const map: Record<string, ChunkWithItemMeta[]> = {}
    for (const c of filteredChunks) {
      const key = c.item_unit_id || "__unknown__"
      if (!map[key]) map[key] = []
      map[key].push(c)
    }
    // Also include items that only have care notes (no manual chunks matching filter)
    for (const [iuId, notes] of Object.entries(itemCareNotes)) {
      if (!map[iuId] && notes.length > 0) map[iuId] = []
    }
    return map
  }, [filteredChunks, itemCareNotes])

  const groupedByCategory = useMemo(() => {
    const map: Record<string, Record<string, ChunkWithItemMeta[]>> = {}
    for (const c of filteredChunks) {
      const cat = c.item_category ?? "Uncategorized"
      if (!map[cat]) map[cat] = {}
      const iuId = c.item_unit_id || "__unknown__"
      if (!map[cat][iuId]) map[cat][iuId] = []
      map[cat][iuId].push(c)
    }
    return map
  }, [filteredChunks])

  const groupedByRoom = useMemo(() => {
    const map: Record<string, Record<string, ChunkWithItemMeta[]>> = {}
    for (const c of filteredChunks) {
      const room = c.room_name ?? "No Room"
      if (!map[room]) map[room] = {}
      const iuId = c.item_unit_id || "__unknown__"
      if (!map[room][iuId]) map[room][iuId] = []
      map[room][iuId].push(c)
    }
    return map
  }, [filteredChunks])

  const countLine =
    filteredChunks.length === 0
      ? "No matching excerpts"
      : `${filteredChunks.length} excerpt${filteredChunks.length === 1 ? "" : "s"}`

  const itemRowProps = {
    typeFilter,
    expandedItems,
    expandedTypes,
    setExpandedItems,
    setExpandedTypes,
  }

  return (
    <PageContainer>
      <PageHeader title="Care Guide" />
      <FilterTabs<Tab>
        options={[
          { value: "house", label: "House" },
          { value: "rooms", label: "Rooms" },
          { value: "items", label: "Items" },
          { value: "saved", label: "Saved Q&A" },
        ]}
        value={tab}
        onChange={setTab}
        className="mb-4"
      />

      {/* ── House ── */}
      {tab === "house" && (
        <>
          <div className="flex flex-wrap gap-2 mb-4">
            <Button
              size="sm"
              onClick={() => setAddNoteContext({ scope: "home" })}
            >
              + Add tip
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={suggestingId === "house"}
              onClick={() =>
                handleSuggest("house", "home", {
                  home_name: home?.name,
                  existing_tips: houseNotes.map(
                    (n) => (n.title ?? "") + " " + n.content.slice(0, 80)
                  ),
                })
              }
            >
              {suggestingId === "house" ? "Generating…" : "✨ Suggest tips"}
            </Button>
          </div>
          {suggestingId === "house" && (
            <p className="text-sm text-muted-foreground animate-pulse mb-3">
              Generating suggestions…
            </p>
          )}
          {suggestErrors["house"] && (
            <p className="text-sm text-destructive mb-3">{suggestErrors["house"]}</p>
          )}
          <SuggestionCards
            suggestions={suggestions["house"] ?? []}
            onDismiss={(id) => dismissSuggestion("house", id)}
            onSave={(s) => saveSuggestion("house", s, { scope: "home" })}
          />
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : houseNotes.length === 0 && (suggestions["house"] ?? []).length === 0 ? (
            <EmptyState
              title="No house-level care tips yet"
              description="Add your own or let AI suggest some."
            />
          ) : (
            <div className="space-y-2">
              {houseNotes.map((n) => (
                <div key={n.note_id} className="border rounded-lg p-3">
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-muted-foreground mb-0.5">
                        {n.category ?? "Uncategorized"} · {n.chunk_type}
                        {n.source !== "user" && (
                          <span className="ml-1.5">
                            <SourceBadge source={n.source} sourceUrl={n.source_url} />
                          </span>
                        )}
                      </div>
                      {n.title && <div className="font-medium text-sm">{n.title}</div>}
                      <p className="text-sm text-muted-foreground mt-0.5">{n.content}</p>
                    </div>
                    <Button
                      size="xs"
                      variant="ghost"
                      className="text-destructive hover:text-destructive shrink-0"
                      onClick={async () => {
                        const r = await deleteCareNote(homeId, n.note_id)
                        if (!r.error)
                          setHouseNotes((prev) => prev.filter((x) => x.note_id !== n.note_id))
                      }}
                    >
                      <Trash2Icon className="size-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Rooms ── */}
      {tab === "rooms" && (
        <>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : rooms.length === 0 ? (
            <EmptyState
              title="No rooms yet"
              description="Add rooms in Settings to add room-level care tips."
            />
          ) : (
            <div className="space-y-3">
              {rooms.map((room) => {
                const tips = roomNotes.filter((n) => n.room_id === room.room_id)
                const roomSuggestions = suggestions[room.room_id] ?? []
                const isLoadingRoom = suggestingId === room.room_id
                return (
                  <div key={room.room_id} className="border rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between py-2.5 px-3.5 bg-muted/20 border-b border-border">
                      <span className="font-semibold text-sm">
                        {room.name}
                        <span className="ml-1.5 text-xs text-muted-foreground font-normal">
                          {tips.length} tip{tips.length !== 1 ? "s" : ""}
                        </span>
                      </span>
                      <div className="flex gap-1.5">
                        <Button
                          size="xs"
                          variant="ghost"
                          disabled={isLoadingRoom}
                          onClick={() =>
                            handleSuggest(room.room_id, "room", {
                              room_name: room.name,
                              existing_tips: tips.map(
                                (n) => (n.title ?? "") + " " + n.content.slice(0, 80)
                              ),
                            })
                          }
                        >
                          {isLoadingRoom ? "…" : "✨ Suggest"}
                        </Button>
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() =>
                            setAddNoteContext({
                              scope: "room",
                              roomId: room.room_id,
                              roomName: room.name,
                            })
                          }
                        >
                          + Add tip
                        </Button>
                      </div>
                    </div>
                    {suggestErrors[room.room_id] && (
                      <p className="text-xs text-destructive px-3.5 pt-2">{suggestErrors[room.room_id]}</p>
                    )}
                    <div className="p-3">
                      {roomSuggestions.length > 0 && (
                        <div className="mb-3">
                          <SuggestionCards
                            suggestions={roomSuggestions}
                            onDismiss={(id) => dismissSuggestion(room.room_id, id)}
                            onSave={(s) =>
                              saveSuggestion(room.room_id, s, {
                                scope: "room",
                                room_id: room.room_id,
                              })
                            }
                          />
                        </div>
                      )}
                      {tips.length === 0 && roomSuggestions.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No tips yet — add your own or get suggestions.
                        </p>
                      ) : (
                        <ul className="space-y-1.5 list-none p-0 m-0">
                          {tips.map((n) => (
                            <li
                              key={n.note_id}
                              className="text-sm flex items-start justify-between gap-2 border-b border-border py-2 last:border-0 last:pb-0"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  {n.title && (
                                    <span className="font-medium">{n.title}</span>
                                  )}
                                  <SourceBadge source={n.source} sourceUrl={n.source_url} />
                                </div>
                                <span className="text-muted-foreground line-clamp-2">
                                  {n.content}
                                </span>
                              </div>
                              <button
                                type="button"
                                className="text-muted-foreground hover:text-destructive transition-colors shrink-0 mt-0.5"
                                onClick={async () => {
                                  const r = await deleteCareNote(homeId, n.note_id)
                                  if (!r.error)
                                    setRoomNotes((prev) =>
                                      prev.filter((x) => x.note_id !== n.note_id)
                                    )
                                }}
                                aria-label="Delete tip"
                              >
                                <Trash2Icon className="size-3" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ── Items ── */}
      {tab === "items" && (
        <>
          <div className="flex flex-wrap gap-2 mb-3">
            <div className="relative flex-1 min-w-[180px]">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search excerpts…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as ChunkTypeFilter)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="care">Care</SelectItem>
                <SelectItem value="how_to">How To</SelectItem>
                <SelectItem value="troubleshooting">Troubleshooting</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs font-semibold text-muted-foreground">Group by</span>
            <div className="flex bg-muted rounded-lg p-0.5 gap-0.5">
              {(["item", "category", "room"] as GroupBy[]).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGroupBy(g)}
                  className={cn(
                    "px-3 py-1 rounded-md text-xs font-semibold transition-all",
                    groupBy === g
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {g === "item" ? "Item" : g === "category" ? "Category" : "Room"}
                </button>
              ))}
            </div>
          </div>

          <p className="text-xs text-muted-foreground mb-3">{countLine}</p>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : Object.keys(groupedByItem).length === 0 ? (
            <EmptyState
              title="No manual excerpts yet"
              description="Add manuals to your items and parse them to see care, how-to, and troubleshooting tips here."
            />
          ) : groupBy === "item" ? (
            <div className="space-y-0">
              {Object.entries(groupedByItem).map(([iuId, items]) => (
                <ItemRow
                  key={iuId}
                  itemUnitId={iuId}
                  itemName={items[0]?.item_name ?? "Unknown"}
                  items={items}
                  careNotes={itemCareNotes[iuId] ?? []}
                  {...itemRowProps}
                  onDeleteCareNote={(noteId) => handleDeleteItemCareNote(iuId, noteId)}
                  onAddCareNote={() =>
                    setAddNoteContext({
                      scope: "item_unit",
                      itemUnitId: iuId,
                      itemName: items[0]?.item_name ?? "Unknown",
                    })
                  }
                  itemCategory={items[0]?.item_category ?? null}
                  isSuggesting={suggestingId === iuId}
                  itemSuggestions={suggestions[iuId] ?? []}
                  itemSuggestError={suggestErrors[iuId] ?? null}
                  onSuggestCareNote={() =>
                    handleSuggest(iuId, "item_unit", {
                      item_name: items[0]?.item_name ?? "Unknown",
                      item_category: items[0]?.item_category ?? null,
                      existing_tips: (itemCareNotes[iuId] ?? []).map(
                        (n) => (n.title ?? "") + " " + n.content.slice(0, 80)
                      ),
                    })
                  }
                  onDismissSuggestion={(id) => dismissSuggestion(iuId, id)}
                  onSaveSuggestion={(s) =>
                    saveSuggestion(iuId, s, { scope: "item_unit", item_unit_id: iuId })
                  }
                />
              ))}
            </div>
          ) : groupBy === "category" ? (
            <div className="space-y-4">
              {Object.entries(groupedByCategory).map(([catName, itemMap]) => {
                const itemCount = Object.keys(itemMap).length
                const groupExpanded = expandedGroups.has(catName)
                return (
                  <div key={catName} className="space-y-1.5">
                    <button
                      type="button"
                      onClick={() => setExpandedGroups((prev) => toggleSet(prev, catName))}
                      className={cn(
                        "flex items-center gap-2 w-full py-2.5 px-3.5 rounded-lg border border-border",
                        "bg-background font-bold text-sm hover:bg-muted/40 transition-colors"
                      )}
                    >
                      <ChevronRightIcon
                        className={cn(
                          "size-3.5 text-muted-foreground shrink-0 transition-transform",
                          groupExpanded && "rotate-90"
                        )}
                      />
                      <span className="flex-1 text-left">{catName}</span>
                      <span className="text-xs text-muted-foreground font-normal">
                        {itemCount} items
                      </span>
                    </button>
                    {groupExpanded && (
                      <div className="pl-4 space-y-0">
                        {Object.entries(itemMap).map(([iuId, items]) => (
                          <ItemRow
                            key={iuId}
                            itemUnitId={iuId}
                            itemName={items[0]?.item_name ?? "Unknown"}
                            items={items}
                            careNotes={itemCareNotes[iuId] ?? []}
                            {...itemRowProps}
                            onDeleteCareNote={(noteId) =>
                              handleDeleteItemCareNote(iuId, noteId)
                            }
                            onAddCareNote={() =>
                              setAddNoteContext({
                                scope: "item_unit",
                                itemUnitId: iuId,
                                itemName: items[0]?.item_name ?? "Unknown",
                              })
                            }
                            itemCategory={items[0]?.item_category ?? null}
                            isSuggesting={suggestingId === iuId}
                            itemSuggestions={suggestions[iuId] ?? []}
                            itemSuggestError={suggestErrors[iuId] ?? null}
                            onSuggestCareNote={() =>
                              handleSuggest(iuId, "item_unit", {
                                item_name: items[0]?.item_name ?? "Unknown",
                                item_category: items[0]?.item_category ?? null,
                                existing_tips: (itemCareNotes[iuId] ?? []).map(
                                  (n) => (n.title ?? "") + " " + n.content.slice(0, 80)
                                ),
                              })
                            }
                            onDismissSuggestion={(id) => dismissSuggestion(iuId, id)}
                            onSaveSuggestion={(s) =>
                              saveSuggestion(iuId, s, { scope: "item_unit", item_unit_id: iuId })
                            }
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(groupedByRoom).map(([roomName, itemMap]) => {
                const itemCount = Object.keys(itemMap).length
                const groupExpanded = expandedGroups.has(roomName)
                return (
                  <div key={roomName} className="space-y-1.5">
                    <button
                      type="button"
                      onClick={() => setExpandedGroups((prev) => toggleSet(prev, roomName))}
                      className={cn(
                        "flex items-center gap-2 w-full py-2.5 px-3.5 rounded-lg border border-border",
                        "bg-background font-bold text-sm hover:bg-muted/40 transition-colors"
                      )}
                    >
                      <ChevronRightIcon
                        className={cn(
                          "size-3.5 text-muted-foreground shrink-0 transition-transform",
                          groupExpanded && "rotate-90"
                        )}
                      />
                      <span className="flex-1 text-left">{roomName}</span>
                      <span className="text-xs text-muted-foreground font-normal">
                        {itemCount} items
                      </span>
                    </button>
                    {groupExpanded && (
                      <div className="pl-4 space-y-0">
                        {Object.entries(itemMap).map(([iuId, items]) => (
                          <ItemRow
                            key={iuId}
                            itemUnitId={iuId}
                            itemName={items[0]?.item_name ?? "Unknown"}
                            items={items}
                            careNotes={itemCareNotes[iuId] ?? []}
                            {...itemRowProps}
                            onDeleteCareNote={(noteId) =>
                              handleDeleteItemCareNote(iuId, noteId)
                            }
                            onAddCareNote={() =>
                              setAddNoteContext({
                                scope: "item_unit",
                                itemUnitId: iuId,
                                itemName: items[0]?.item_name ?? "Unknown",
                              })
                            }
                            itemCategory={items[0]?.item_category ?? null}
                            isSuggesting={suggestingId === iuId}
                            itemSuggestions={suggestions[iuId] ?? []}
                            itemSuggestError={suggestErrors[iuId] ?? null}
                            onSuggestCareNote={() =>
                              handleSuggest(iuId, "item_unit", {
                                item_name: items[0]?.item_name ?? "Unknown",
                                item_category: items[0]?.item_category ?? null,
                                existing_tips: (itemCareNotes[iuId] ?? []).map(
                                  (n) => (n.title ?? "") + " " + n.content.slice(0, 80)
                                ),
                              })
                            }
                            onDismissSuggestion={(id) => dismissSuggestion(iuId, id)}
                            onSaveSuggestion={(s) =>
                              saveSuggestion(iuId, s, { scope: "item_unit", item_unit_id: iuId })
                            }
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ── Saved Q&A ── */}
      {tab === "saved" && (
        <>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : faqs.length === 0 ? (
            <EmptyState
              title="No saved Q&A yet"
              description={'In Ask, when you get a helpful answer, use "Save to knowledge base" to add it here.'}
            />
          ) : (
            <div className="space-y-6">
              {[
                "__general__",
                ...Object.keys(faqsWithItemNames).filter((k) => k !== "__general__"),
              ].map((key) => {
                const list = faqsWithItemNames[key] ?? []
                if (list.length === 0) return null
                return (
                  <SectionCard
                    key={key}
                    title={key === "__general__" ? "General" : itemNamesById[key] ?? "Item"}
                  >
                    <ul className="space-y-4 list-none p-0 m-0">
                      {list.map((faq) => (
                        <li
                          key={faq.faq_id}
                          className="flex flex-col gap-1 border-b border-border pb-3 last:border-0 last:pb-0"
                        >
                          <p className="font-semibold text-sm">{faq.question}</p>
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                            {faq.answer}
                          </p>
                          <Button
                            variant="ghost"
                            size="xs"
                            className="w-fit text-destructive hover:text-destructive"
                            onClick={() => handleDeleteFaq(faq.faq_id)}
                            aria-label="Delete FAQ"
                          >
                            <Trash2Icon className="size-3" aria-hidden />
                            Delete
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </SectionCard>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ── Single AddNoteSheet for all scopes ── */}
      <AddNoteSheet
        open={addNoteContext !== null}
        onClose={() => setAddNoteContext(null)}
        homeId={homeId}
        scope={addNoteContext?.scope ?? "home"}
        roomId={addNoteContext?.roomId}
        roomName={addNoteContext?.roomName}
        itemUnitId={addNoteContext?.itemUnitId}
        itemName={addNoteContext?.itemName}
        onSaved={handleNoteSaved}
      />
    </PageContainer>
  )
}
