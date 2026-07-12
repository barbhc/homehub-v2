import { useEffect, useState } from "react"
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom"
import { PageContainer, EmptyState } from "@/components/layout"
import { useAuth } from "@/modules/auth"
import { useCurrentHome } from "@/modules/home"
import { getRooms } from "@/modules/home"
import { getItemUnit, softDeleteItemUnit } from "@/modules/items"
import {
  getTaskTemplatesWithSchedulesByItem,
  type TaskTemplateWithSchedule,
} from "@/modules/care"
import {
  getChunksByItem,
  getManualsByItem,
  parseManual,
  getFaqsByItem,
  updateChunkSourcePages,
} from "@/modules/knowledge"
import { useManualManagement, getManualUrl } from "@/hooks/useManualManagement"
import { supabase } from "@/integrations/shim/client"
import type {
  ItemUnit,
  KnowledgeChunk,
  ManualDocument,
  Room,
  ChatFaq,
} from "@/integrations/types"
import {
  RecallBanner,
  WarrantyCard,
} from "@/components/knowledge"
import { ManualDockPanel } from "@/components/care/ManualDockPanel"
import { RefinedItemDetail } from "@/components/home/RefinedItemDetail"
import { DesktopItemDetail } from "@/components/home/DesktopItemDetail"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  HeroCard,
  TaskSection,
  ManualSection,
  KnowledgeSection,
  SpecsSection,
  HistorySection,
  NotesCard,
  SidebarActions,
  SetupChecklistSection,
  HabitsSection,
} from "./item-detail"

export default function ItemDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { home } = useCurrentHome()
  const { user } = useAuth()

  const [item, setItem] = useState<ItemUnit | null>(null)
  const [tasks, setTasks] = useState<TaskTemplateWithSchedule[]>([])
  const [chunks, setChunks] = useState<KnowledgeChunk[]>([])
  const [manuals, setManuals] = useState<ManualDocument[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [faqs, setFaqs] = useState<ChatFaq[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [manualPdfUrl, setManualPdfUrl] = useState<string | null>(null)
  const [allHomeTags, setAllHomeTags] = useState<string[]>([])
  const [isCheckingRecalls, setIsCheckingRecalls] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [knowledgeManualPageOpen, setKnowledgeManualPageOpen] = useState(false)
  const [knowledgeManualPage, setKnowledgeManualPage] = useState(1)
  const [knowledgeChunkId, setKnowledgeChunkId] = useState<string | null>(null)
  // Resizable manual dock (design option 4): size is vw on desktop, vh on mobile.
  const [manualDockSize, setManualDockSize] = useState(42)
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches)
  const [historyKey, setHistoryKey] = useState(0)
  const [editOpen, setEditOpen] = useState(false)

  // Fetch all tags used across home items for autocomplete suggestions
  useEffect(() => {
    if (!home) return
    let cancelled = false
    supabase
      .from("item_unit")
      .select("tags")
      .eq("home_id", home.home_id)
      .is("deleted_at", null)
      .then(({ data }) => {
        if (cancelled || !data) return
        const all = data.flatMap((r) => (r.tags as string[]) ?? [])
        setAllHomeTags([...new Set(all)].sort())
      })
    return () => { cancelled = true }
  }, [home])

  // --- Extracted hooks ---
  const manualMgmt = useManualManagement({
    itemId: id ?? "",
    homeId: home?.home_id ?? "",
    userId: user?.id,
    setManuals: (fn) => setManuals(fn),
    setChunks,
    setTasks,
  })

  // Main data fetch
  useEffect(() => {
    if (!home || !id) return
    let cancelled = false
    setLoading(true)
    Promise.all([
      getItemUnit(home.home_id, id),
      getTaskTemplatesWithSchedulesByItem(home.home_id, id),
      getChunksByItem(home.home_id, id),
      getManualsByItem(home.home_id, id),
      getRooms(home.home_id),
      getFaqsByItem(home.home_id, id),
    ]).then(([itemRes, tasksRes, chunksRes, manualsRes, roomsRes, faqsRes]) => {
      if (cancelled) return
      setLoading(false)
      setItem(itemRes.data ?? null)
      setTasks(tasksRes.data ?? [])
      setChunks(chunksRes.data ?? [])
      setManuals(manualsRes.data ?? [])
      setRooms(roomsRes.data ?? [])
      setFaqs(faqsRes.data ?? [])

      // Resolve PDF URL for "See page X" links
      const firstManual = (manualsRes.data ?? [])[0]
      if (firstManual) {
        const url = getManualUrl(firstManual.source_type, firstManual.source_ref)
        if (url) setManualPdfUrl(url)
      }

      // Auto-parse manuals that haven't been parsed yet AND were created
      // recently (within the last 10 minutes).
      const TEN_MINUTES = 10 * 60 * 1000
      const unparsed = (manualsRes.data ?? []).filter(
        (m) => !m.parsed_at && Date.now() - new Date(m.created_at).getTime() < TEN_MINUTES
      )
      for (const manual of unparsed) {
        manualMgmt.setParsingManualId(manual.manual_id)
        parseManual(manual.manual_id).then(async (result) => {
          if (cancelled) return
          manualMgmt.setParsingManualId(null)
          if (!result.ok) {
            manualMgmt.setParseError(`Auto-parsing failed: ${result.error}`)
          }
          if (result.ok) {
            const [chunksRes2, tasksRes2] = await Promise.all([
              getChunksByItem(home.home_id, id),
              getTaskTemplatesWithSchedulesByItem(home.home_id, id),
            ])
            if (!cancelled && chunksRes2.data) setChunks(chunksRes2.data)
            if (!cancelled && tasksRes2.data) setTasks(tasksRes2.data)

            setManuals((prev) =>
              prev.map((m) =>
                m.manual_id === manual.manual_id
                  ? { ...m, parsed_at: new Date().toISOString() }
                  : m
              )
            )
          }
        })
      }
    })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-fetch when home_id or id changes
  }, [home?.home_id, id])

  // Deep-link: arriving via /items/:id?manualPage=N (from a task's "From your
  // manual · p.N" reference) auto-opens the manual viewer at that page. Consume
  // the param once the PDF is loaded so it doesn't re-open on back/rerender.
  useEffect(() => {
    const raw = searchParams.get("manualPage")
    if (!raw || !manualPdfUrl) return
    const page = Number(raw)
    if (Number.isFinite(page) && page > 0) {
      setKnowledgeManualPage(page)
      setKnowledgeChunkId(null)
      setKnowledgeManualPageOpen(true)
    }
    const next = new URLSearchParams(searchParams)
    next.delete("manualPage")
    setSearchParams(next, { replace: true })
  }, [manualPdfUrl, searchParams, setSearchParams])

  // Manual dock orientation: right panel on desktop, bottom panel on mobile.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)")
    const on = () => setIsDesktop(mq.matches)
    mq.addEventListener("change", on)
    return () => mq.removeEventListener("change", on)
  }, [])

  const handleDelete = async () => {
    if (!home || !id) return
    setDeleting(true)
    const result = await softDeleteItemUnit(home.home_id, id)
    setDeleting(false)
    if (result.success) {
      navigate("/inventory")
    } else {
      setError(`Could not delete item: ${result.error}`)
    }
  }

  const handleCheckRecalls = async () => {
    if (!id || !home) return
    setIsCheckingRecalls(true)
    try {
      await supabase.functions.invoke("check-recalls", { body: { item_unit_id: id } })
      const res = await getItemUnit(home.home_id, id)
      if (res.data) setItem(res.data)
    } finally {
      setIsCheckingRecalls(false)
    }
  }

  if (loading) {
    return (
      <PageContainer>
        <p className="text-muted-foreground">Loading...</p>
      </PageContainer>
    )
  }

  if (!item) {
    return (
      <PageContainer>
        <EmptyState title="Item not found" description="This item may have been removed." />
      </PageContainer>
    )
  }

  const specsChunks = chunks.filter((c) => c.chunk_type === "specs")
  const hasParsedManual = manuals.some((m) => m.parsed_at !== null)

  // Split tasks by schedule_type into three surfaces:
  //   setup   → SetupChecklistSection (install-time, one-off)
  //   habit   → HabitsSection (as_needed / after_each_use — no due date, not in task feed)
  //   regular → TaskSection (recurring scheduled tasks)
  const HABIT_TYPES = new Set(["as_needed", "after_each_use"])

  const setupTasks = tasks.filter(
    (t) => t.schedule_rule?.[0]?.schedule_type === "setup",
  )
  const habitTasks = tasks.filter(
    (t) => HABIT_TYPES.has(t.schedule_rule?.[0]?.schedule_type ?? ""),
  )
  const regularTasks = tasks.filter((t) => {
    const st = t.schedule_rule?.[0]?.schedule_type ?? ""
    return st !== "setup" && !HABIT_TYPES.has(st)
  })

  // When TaskSection updates its slice, preserve setup + habit tasks in the unified state.
  const handleRegularTasksChange = (updated: typeof tasks) => {
    setTasks([...setupTasks, ...habitTasks, ...updated])
  }

  const howToChunks = chunks.filter((c) => c.chunk_type === "how_to")
  const troubleshootingChunks = chunks.filter((c) => c.chunk_type === "troubleshooting")

  const manualSectionProps = {
    homeId: home?.home_id ?? "",
    manuals,
    onManualUpdated: (updated: ManualDocument) =>
      setManuals((prev) => prev.map((m) => (m.manual_id === updated.manual_id ? updated : m))),
    addManualOpen: manualMgmt.addManualOpen,
    setAddManualOpen: manualMgmt.setAddManualOpen,
    addMode: manualMgmt.addMode,
    setAddMode: manualMgmt.setAddMode,
    addRole: manualMgmt.addRole,
    setAddRole: manualMgmt.setAddRole,
    urlInput: manualMgmt.urlInput,
    setUrlInput: manualMgmt.setUrlInput,
    titleInput: manualMgmt.titleInput,
    setTitleInput: manualMgmt.setTitleInput,
    labelInput: manualMgmt.labelInput,
    setLabelInput: manualMgmt.setLabelInput,
    setUploadFile: manualMgmt.setUploadFile,
    addError: manualMgmt.addError,
    setAddError: manualMgmt.setAddError,
    addLoading: manualMgmt.addLoading,
    parsePhase: manualMgmt.parsePhase,
    setManualParseError: manualMgmt.setParseError,
    parsingManualId: manualMgmt.parsingManualId,
    parsedManualId: manualMgmt.parsedManualId,
    setParsedManualId: manualMgmt.setParsedManualId,
    previewResult: manualMgmt.previewResult,
    setPreviewResult: manualMgmt.setPreviewResult,
    reviewOpen: manualMgmt.reviewOpen,
    setReviewOpen: manualMgmt.setReviewOpen,
    saving: manualMgmt.saving,
    deletingManualId: manualMgmt.deletingManualId,
    handleOpenAddManual: manualMgmt.handleOpenAddManual,
    handleAddManual: manualMgmt.handleAddManual,
    handleParseExistingManual: manualMgmt.handleParseExistingManual,
    handleRescanManual: manualMgmt.handleRescanManual,
    handleFillGaps: manualMgmt.handleFillGaps,
    handleDeleteManual: manualMgmt.handleDeleteManual,
    handleSave: manualMgmt.handleSave,
  }

  const openManualPage = (page: number, chunkId: string | null = null) => {
    setKnowledgeManualPage(page)
    setKnowledgeChunkId(chunkId)
    setKnowledgeManualPageOpen(true)
  }

  // Hide the manual dock while a modal (Edit) is open — the dialog dims the page
  // and must sit above the dock, so we drop the dock and restore it on close.
  const dockOpen = knowledgeManualPageOpen && !!manualPdfUrl && !editOpen
  return (
    <div
      style={{
        paddingRight: dockOpen && isDesktop ? `${manualDockSize}vw` : undefined,
        paddingBottom: dockOpen && !isDesktop ? `${manualDockSize}vh` : undefined,
        transition: "padding 140ms ease",
      }}
    >
      <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      {(error || manualMgmt.parseError) && (
        <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-2 text-sm text-amber-800 dark:text-amber-200 mb-4">
          {error || manualMgmt.parseError}
        </div>
      )}

      {/* Redesigned item detail — RefinedItemDetail (mobile) · DesktopItemDetail (lg+) */}
      <div className="lg:hidden -mx-4 sm:-mx-6">
        <div className="mx-auto w-full max-w-[460px]">
          <RefinedItemDetail
            key={item.item_unit_id}
            item={item}
            rooms={rooms}
            homeId={home!.home_id}
            tasks={tasks}
            chunks={chunks}
            hasManual={hasParsedManual}
            onBack={() => navigate("/inventory")}
            onOpenManualPage={(page) => openManualPage(page)}
            onItemUpdate={setItem}
          />

          {/* Mobile gap-fill — data-bearing sections that RefinedItemDetail omits.
              Care (habits / scheduled / setup) is handled inside RefinedItemDetail's
              CareBlock; each section below self-guards on empty data. */}
          <div className="px-5 pb-10 space-y-4">
            <KnowledgeSection
              chunks={chunks}
              faqs={faqs}
              hasParsedManual={hasParsedManual}
              onFaqsChange={setFaqs}
            />
            <SpecsSection
              specsChunks={specsChunks}
              hasBrandOrModel={!!(item.brand || item.model)}
            />
            <ManualSection {...manualSectionProps} />
            {manuals.length > 0 && (
              <HistorySection homeId={home!.home_id} itemId={id!} refreshKey={historyKey} />
            )}
          </div>
        </div>
      </div>
      <div className="hidden lg:block">
        <DesktopItemDetail
          key={item.item_unit_id}
          item={item}
          rooms={rooms}
          homeId={home!.home_id}
          tasks={tasks}
          chunks={chunks}
          manuals={manuals}
          faqs={faqs}
          historyKey={historyKey}
          onBack={() => navigate("/inventory")}
          onEdit={() => setEditOpen(true)}
          onOpenManualPage={(page) => openManualPage(page)}
          onItemUpdate={setItem}
          manualSectionProps={manualSectionProps}
        />
      </div>

      {/* Desktop edit — reuses HeroCard inline editing in a dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit item</DialogTitle>
          </DialogHeader>
          <HeroCard
            item={item}
            rooms={rooms}
            homeId={home!.home_id}
            userId={user?.id}
            allHomeTags={allHomeTags}
            onItemUpdate={setItem}
            onTagsChange={setAllHomeTags}
            onDelete={handleDelete}
            deleting={deleting}
            sidebarMode
          />
        </DialogContent>
      </Dialog>

      {/* Old item detail kept hidden until the desktop redesign lands */}
      <div className="hidden">
      {/* Desktop: sidebar + main | Mobile: single column */}
      <div className="lg:grid lg:grid-cols-[320px_1fr] lg:gap-6 lg:items-start">
        {/* ── Sidebar (sticky on desktop) ── */}
        <div className="lg:sticky lg:top-6 space-y-4 mb-6 lg:mb-0">
          <HeroCard
            item={item}
            rooms={rooms}
            homeId={home!.home_id}
            userId={user?.id}
            allHomeTags={allHomeTags}
            onItemUpdate={setItem}
            onTagsChange={setAllHomeTags}
            onDelete={handleDelete}
            deleting={deleting}
            sidebarMode
          />

          {/* Notes — visible on desktop sidebar, hidden on mobile (shown later) */}
          <NotesCard
            item={item}
            homeId={home!.home_id}
            onItemUpdate={setItem}
            className="hidden lg:block"
          />

          {/* Quick actions — desktop sidebar only */}
          <SidebarActions
            onOpenManual={() => manualMgmt.setAddManualOpen(true)}
            onRescan={hasParsedManual ? () => manualMgmt.handleRescanManual(manuals[0].manual_id) : undefined}
            onTroubleshoot={id ? () => navigate(`/chat?item=${id}`) : undefined}
          />
        </div>

        {/* ── Main column ── */}
        <div className="space-y-6">
          <SetupChecklistSection
            tasks={setupTasks}
            homeId={home!.home_id}
            itemId={id!}
          />

          {/* Mobile troubleshoot entry — hidden on desktop where SidebarActions has it */}
          {id && (
            <Link
              to={`/chat?item=${id}`}
              className="lg:hidden flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground hover:border-foreground/20 hover:bg-accent/50 transition-colors"
            >
              <span className="text-base">🔧</span>
              Fix a problem
            </Link>
          )}

          <TaskSection
            tasks={regularTasks}
            homeId={home!.home_id}
            itemId={id!}
            manualPdfUrl={manualPdfUrl}
            onTasksChange={handleRegularTasksChange}
            onError={setError}
            howToChunks={howToChunks}
            troubleshootingChunks={troubleshootingChunks}
            onOpenManualPage={openManualPage}
            hasManual={hasParsedManual}
            onChunksChange={(ht, ts) => {
              setChunks((prev) => {
                // Replace how_to and troubleshooting chunks, keep everything else
                const other = prev.filter((c) => c.chunk_type !== "how_to" && c.chunk_type !== "troubleshooting")
                return [...other, ...ht, ...ts]
              })
            }}
            onHistoryRefresh={() => setHistoryKey((k) => k + 1)}
          />

          {/* Habits & Reminders — habit-type tasks (as_needed / after_each_use) */}
          <HabitsSection tasks={habitTasks} />

          {/* Notes — mobile only (below tasks) */}
          <NotesCard
            item={item}
            homeId={home!.home_id}
            onItemUpdate={setItem}
            className="lg:hidden"
          />

          <HistorySection homeId={home!.home_id} itemId={id!} refreshKey={historyKey} />

          <KnowledgeSection
            chunks={chunks}
            faqs={faqs}
            hasParsedManual={hasParsedManual}
            onFaqsChange={setFaqs}
          />

          <SpecsSection
            specsChunks={specsChunks}
            hasBrandOrModel={!!(item.brand || item.model)}
          />

          <ManualSection {...manualSectionProps} />

          <RecallBanner
            item={item}
            onCheckNow={handleCheckRecalls}
            isChecking={isCheckingRecalls}
          />
          <WarrantyCard item={item} />
        </div>
      </div>
      </div>

      </div>

      {manualPdfUrl && (
        <ManualDockPanel
          open={knowledgeManualPageOpen && !editOpen}
          onOpenChange={setKnowledgeManualPageOpen}
          pdfUrl={manualPdfUrl}
          pageNumber={knowledgeManualPage}
          isDesktop={isDesktop}
          size={manualDockSize}
          onSizeChange={setManualDockSize}
          onSetPage={knowledgeChunkId ? async (newPage) => {
            const chunk = chunks.find((c) => c.chunk_id === knowledgeChunkId)
            if (home && chunk) await updateChunkSourcePages(home.home_id, chunk.manual_id, knowledgeChunkId, [newPage])
            setChunks((prev) =>
              prev.map((c) =>
                c.chunk_id === knowledgeChunkId
                  ? { ...c, source_pages: [newPage] }
                  : c
              )
            )
          } : undefined}
        />
      )}
    </div>
  )
}
