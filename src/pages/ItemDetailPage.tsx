import { useEffect, useState } from "react"
import { ACTIVE_PARSE_STAGES } from "@/modules/knowledge/services/parseManualService"
import { ReviewItemTasksButton } from "@/components/manuals/ReviewItemTasksButton"
import { ParsePickupCard } from "@/components/manuals/ParsePickupCard"
import { useParams, useNavigate, useSearchParams } from "react-router-dom"
import { PageContainer, EmptyState } from "@/components/layout"
import { useAuth } from "@/modules/auth"
import { useCurrentHome } from "@/modules/home"
import { getRooms } from "@/modules/home"
import { getItemUnit, softDeleteItemUnit, updateItemUnit } from "@/modules/items"
import {
  getTaskTemplatesWithSchedulesByItem,
  type TaskTemplateWithSchedule,
} from "@/modules/care"
import {
  getChunksByItem,
  getManualsByItem,
  getFaqsByItem,
  updateChunkSourcePages,
} from "@/modules/knowledge"
import { useManualManagement, resolveManualUrl } from "@/hooks/useManualManagement"
import { track } from "@/lib/analytics"
import { collection, getDocs, query, where } from "firebase/firestore"
import { db } from "@/integrations/firebase"
import type {
  ItemUnit,
  KnowledgeChunk,
  ManualDocument,
  Room,
  ChatFaq,
} from "@/integrations/types"
import { ManualDockPanel } from "@/components/care/ManualDockPanel"
import { RefinedItemDetail } from "@/components/home/RefinedItemDetail"
import { ItemDetailsSheet } from "@/components/item-care/ItemDetailsSheet"
import { PurchaseNudge } from "@/components/item-care/PurchaseNudge"
import { shouldOfferPurchaseNudge } from "@/lib/purchaseNudge"
import { RoomPickerDialog } from "@/components/home/RoomPickerDialog"
import { CategoryPickerDialog } from "@/components/home/CategoryPickerDialog"
import { getCategoryDefinition, type ItemCategoryId } from "@/modules/inventory/constants/itemCategories"
import { DesktopItemDetail } from "@/components/home/DesktopItemDetail"
import { Trash2, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  HeroCard,
  ManualSection,
  KnowledgeSection,
  SpecsSection,
  HistorySection,
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
  /** Bumped by "Try again" to re-run the fetch effect. */
  const [reloadKey, setReloadKey] = useState(0)
  const [manualPdfUrl, setManualPdfUrl] = useState<string | null>(null)
  const [allHomeTags, setAllHomeTags] = useState<string[]>([])
  const [deleting, setDeleting] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [knowledgeManualPageOpen, setKnowledgeManualPageOpen] = useState(false)
  const [knowledgeManualPage, setKnowledgeManualPage] = useState(1)
  const [knowledgeChunkId, setKnowledgeChunkId] = useState<string | null>(null)
  // Resizable manual dock (design option 4): size is vw on desktop, vh on mobile.
  const [manualDockSize, setManualDockSize] = useState(42)
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches)
  // Bump to force HistorySection to refetch. Nothing triggers it since the
  // legacy layout was removed; kept as the section's refreshKey input.
  const [historyKey] = useState(0)
  const [editOpen, setEditOpen] = useState(false)
  const [roomPickerOpen, setRoomPickerOpen] = useState(false)
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  /** Bumped on dismissal purely to re-render — localStorage is the source of
   *  truth, and this is what makes the card leave without a reload. */
  const [, setNudgeDismissedAt] = useState(0)
  const [storeHistory, setStoreHistory] = useState<(string | null | undefined)[]>([])

  // One read of the home's items serves two autocompletes: tags, and the
  // retailers already entered — which is what stops "Home Depot" being stored
  // three different ways. Deliberately the same snapshot, not a second query.
  useEffect(() => {
    if (!home) return
    let cancelled = false
    getDocs(query(collection(db, `homes/${home.home_id}/items`), where("deletedAt", "==", null)))
      .then((snap) => {
        if (cancelled) return
        const all = snap.docs.flatMap((d) => (d.data().tags as string[] | undefined) ?? [])
        setAllHomeTags([...new Set(all)].sort())
        setStoreHistory(snap.docs.map((d) => (d.data().store_name as string | null | undefined) ?? null))
      })
      .catch(() => { /* non-fatal — both autocompletes just stay empty */ })
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
    ]).then(async ([itemRes, tasksRes, chunksRes, manualsRes, roomsRes, faqsRes]) => {
      if (cancelled) return
      setLoading(false)
      setItem(itemRes.data ?? null)
      setTasks(tasksRes.data ?? [])
      setChunks(chunksRes.data ?? [])
      setManuals(manualsRes.data ?? [])
      setRooms(roomsRes.data ?? [])
      setFaqs(faqsRes.data ?? [])

      // AHA-candidate funnel event: the user is looking at an item's content.
      // Props let analysis distinguish "opened an empty item" from "saw parsed
      // manual/care content" without a second event.
      if (itemRes.data) {
        track("item_content_viewed", {
          home_id: home.home_id,
          item_id: id,
          chunk_count: chunksRes.data?.length ?? 0,
          manual_count: manualsRes.data?.length ?? 0,
          task_count: tasksRes.data?.length ?? 0,
          faq_count: faqsRes.data?.length ?? 0,
        })
      }

      // Resolve PDF URL for "See page X" links
      const firstManual = (manualsRes.data ?? [])[0]
      if (firstManual) {
        const url = await resolveManualUrl(firstManual.source_type, firstManual.source_ref).catch(() => null)
        if (url && !cancelled) setManualPdfUrl(url)
      }

      // Auto-parse manuals that haven't been parsed yet AND were created
      // recently (within the last 10 minutes).
      const TEN_MINUTES = 10 * 60 * 1000
      const unparsed = (manualsRes.data ?? []).filter(
        (m) => !m.parsed_at && Date.now() - new Date(m.created_at).getTime() < TEN_MINUTES
      )
      // Preview + review, NOT commit. This used to parse in commit mode, which
      // is the same "tasks just appeared" path that was fixed in the add-manual
      // handler — and it would have quietly undone that fix, because a review
      // the user closes without saving leaves the manual unparsed, so the next
      // visit to the item would commit it behind their back.
      //
      // ONE manual, the most recent: each review is a modal sheet, and stacking
      // them would be worse than the problem.
      const toReview = unparsed[0]
      if (toReview) {
        void manualMgmt.handleParseExistingManual(toReview.manual_id)
      }
    })
    .catch((e: unknown) => {
      // Without this the page hangs on "Loading..." forever: a rejection skips
      // the .then, so setLoading(false) never runs and nothing is shown. On a
      // phone one dropped request is enough, and an infinite spinner is
      // indistinguishable from the app just being slow — which is exactly how
      // it was reported. Surface it and let them retry.
      if (cancelled) return
      setLoading(false)
      setError(e instanceof Error ? e.message : "Could not load this item.")
    })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-fetch when home_id or id changes
  }, [home?.home_id, id, reloadKey])

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

  /** Deleting is destructive and cascades to the item's tasks — every entry
   *  point opens the confirm sheet first; only the sheet calls the service. */
  const handleConfirmDelete = async () => {
    if (!home || !id) return
    setDeleting(true)
    const result = await softDeleteItemUnit(home.home_id, id)
    setDeleting(false)
    if (result.success) {
      track("item_deleted", { hasManual: manuals.length > 0, taskCount: tasks.length })
      setConfirmDeleteOpen(false)
      navigate("/inventory")
    } else {
      // Keep the sheet open so the error is visible next to the action that failed.
      setError(`Could not delete item: ${result.error}`)
    }
  }

  if (loading) {
    return (
      <PageContainer>
        <p className="text-muted-foreground">Loading...</p>
      </PageContainer>
    )
  }

  // A failed load is a dead end without this — the page previously showed the
  // spinner forever and offered no way out.
  if (error && !item) {
    return (
      <PageContainer>
        <div className="py-16 text-center">
          <p className="text-[15px] font-semibold text-foreground">Could not load this item.</p>
          <p className="mt-1 text-[13px] text-muted-foreground">{error}</p>
          <button
            type="button"
            onClick={() => { setError(null); setReloadKey((k) => k + 1) }}
            className="mt-4 rounded-xl bg-primary px-4 py-2.5 text-[13.5px] font-bold text-primary-foreground"
          >
            Try again
          </button>
        </div>
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
  // HH-87: mid-parse is neither "has a manual" nor "has none".
  const parsingManual = manuals.some((m) => ACTIVE_PARSE_STAGES.includes(m.parse_stage as never))

  // Task splitting (setup / habit / regular) moved into RefinedItemDetail's
  // CareBlock and DesktopItemDetail when the legacy layout was retired — this
  // page just passes `tasks` through.

  const manualSectionProps = {
    homeId: home?.home_id ?? "",
    // The brand is CONTEXT for the manual search, so prepend it — unless the
    // name already carries it, which every composed name has since #139.
    // Unconditional prepending produced "LG LG DLGX3901B" across the review
    // sheet and the add dialog (owner's round-9 screenshot).
    itemName: item
      ? (item.brand && !item.display_name?.toLowerCase().includes(item.brand.toLowerCase())
          ? `${item.brand} ${item.display_name ?? ""}`.trim()
          : item.display_name) || "This item"
      : undefined,
    itemUnitId: id ?? null,
    brand: item?.brand ?? null,
    model: item?.model ?? null,
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

  const handlePickRoom = async (roomId: string | null) => {
    if (!home || !item) return
    const prev = item
    setItem({ ...item, room_id: roomId })
    const res = await updateItemUnit(home.home_id, item.item_unit_id, { room_id: roomId })
    if (res.error) {
      setItem(prev)
      setError(`Could not change the room: ${res.error.message}`)
    } else if (res.data) {
      setItem(res.data)
    }
  }

  const handlePickCategory = async (category: ItemCategoryId, subType: string | null) => {
    if (!home || !item) return
    const prev = item
    // `category` is the free-text field that drifted ("Small Appliance" vs
    // "Small appliance" vs a raw subtype id). Writing the canonical label
    // alongside the typed fields keeps anything still reading it consistent,
    // while display derives from item_category/sub_type either way.
    const patch = {
      item_category: category,
      sub_type: subType,
      category: getCategoryDefinition(category).label,
    }
    setItem({ ...item, ...patch })
    const res = await updateItemUnit(home.home_id, item.item_unit_id, patch)
    if (res.error) {
      setItem(prev)
      setError(`Could not change the category: ${res.error.message}`)
    } else if (res.data) {
      setItem(res.data)
    }
  }

  const openManualPage = (page: number, chunkId: string | null = null) => {
    setKnowledgeManualPage(page)
    setKnowledgeChunkId(chunkId)
    setKnowledgeManualPageOpen(true)
  }

  // Hide the manual dock while a modal (Edit) is open — the dialog dims the page
  // and must sit above the dock, so we drop the dock and restore it on close.
  const dockOpen = knowledgeManualPageOpen && !!manualPdfUrl && !editOpen

  /**
   * One nudge node, rendered in BOTH lanes. The first pass mounted it only in
   * the mobile tree, so on a laptop the item page never offered the purchase
   * details it was designed to ask for — the same one-lane bug the reminder
   * control had, caught the same way: by looking at the screenshot.
   *
   * Shown while there is still something to gain: no purchase date on the item,
   * and not already waved away on this device.
   */
  const purchaseNudge = shouldOfferPurchaseNudge(item.item_unit_id, item.purchase_date) ? (
    <PurchaseNudge
      itemUnitId={item.item_unit_id}
      onAdd={() => setDetailsOpen(true)}
      onDismissed={() => setNudgeDismissedAt(Date.now())}
    />
  ) : null

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
        // Dismissible. A parse error explains itself once and then just sits
        // there — a tester asked how to clear it and there was no way, so a
        // message about one failed upload followed him around the item forever.
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-2 text-sm text-amber-800 dark:text-amber-200 mb-4">
          <span className="min-w-0 flex-1">{error || manualMgmt.parseError}</span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => {
              setError(null)
              manualMgmt.setParseError(null)
            }}
            className="shrink-0 rounded p-0.5 opacity-70 hover:opacity-100"
          >
            <XIcon className="size-4" />
          </button>
        </div>
      )}

      {manualMgmt.parseReceipt && (
        // Rescan and Fill gaps are the only remaining paths that write tasks
        // without a review step. They are explicit user actions, so a receipt
        // is the right answer rather than a review sheet — but "it just added
        // new tasks to the list" was a bug report, and silence is what made it
        // one.
        <div className="flex items-start gap-2 rounded-lg border px-4 py-2 text-sm mb-4"
          style={{ borderColor: "var(--hh-teal)", background: "var(--hh-teal-wash)", color: "var(--hh-ink)" }}>
          <span className="min-w-0 flex-1">{manualMgmt.parseReceipt}</span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => manualMgmt.setParseReceipt(null)}
            className="shrink-0 rounded p-0.5 opacity-70 hover:opacity-100"
          >
            <XIcon className="size-4" />
          </button>
        </div>
      )}

      {home && id && manuals.length > 0 && (
        <ParsePickupCard
          homeId={home.home_id}
          itemUnitId={id}
          itemName={item.display_name || "This item"}
          manualIds={manuals.map((m) => m.manual_id)}
          onReviewSaved={() => {
            void getTaskTemplatesWithSchedulesByItem(home.home_id, id).then((r) => {
              if (r.data) setTasks(r.data)
            })
          }}
        />
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
            parsingManual={parsingManual}
            onBack={() => navigate("/inventory")}
            onOpenManualPage={(page) => openManualPage(page)}
            canOpenManual={!!manualPdfUrl}
            onAddManual={() => manualMgmt.setAddManualOpen(true)}
            onEditCategory={() => setCategoryPickerOpen(true)}
            onItemUpdate={setItem}
            onEditRoom={() => setRoomPickerOpen(true)}
            onEditDetails={() => setDetailsOpen(true)}
            nudgeSlot={purchaseNudge}
            reviewAction={
              home && id && tasks.length > 0 ? (
                <ReviewItemTasksButton
                  homeId={home.home_id}
                  itemUnitId={id}
                  itemName={manualSectionProps.itemName ?? "This item"}
                  taskCount={tasks.length}
                  compact
                  onDone={() => {
                    void getTaskTemplatesWithSchedulesByItem(home.home_id, id).then((r) => {
                      if (r.data) setTasks(r.data)
                    })
                  }}
                />
              ) : null
            }
            recordsSlot={
              // The reference half of the page, now under one heading instead of
              // trailing off the bottom as four unrelated cards.
              <>
                <SpecsSection
                  specsChunks={specsChunks}
                  hasBrandOrModel={!!(item.brand || item.model)}
                />
                <KnowledgeSection
                  chunks={chunks}
                  faqs={faqs}
                  hasParsedManual={hasParsedManual}
                  onFaqsChange={setFaqs}
                />
                <ManualSection {...manualSectionProps} />
                {manuals.length > 0 && (
                  <HistorySection homeId={home!.home_id} itemId={id!} refreshKey={historyKey} />
                )}

                {/* Delete — quiet, last, and never one-tap destructive. */}
                <button
                  type="button"
                  onClick={() => setConfirmDeleteOpen(true)}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors"
                >
                  <Trash2 className="size-4" aria-hidden />
                  Delete item
                </button>
              </>
            }
          />
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
          nudgeSlot={purchaseNudge}
        />
      </div>

      {home && (
        <RoomPickerDialog
          open={roomPickerOpen}
          onOpenChange={setRoomPickerOpen}
          homeId={home.home_id}
          rooms={rooms}
          currentRoomId={item.room_id}
          onPick={(roomId) => void handlePickRoom(roomId)}
          onRoomCreated={(room) => setRooms((prev) => [...prev, room])}
        />
      )}

      {home && (
        <ItemDetailsSheet
          open={detailsOpen}
          onOpenChange={setDetailsOpen}
          item={item}
          rooms={rooms}
          homeId={home.home_id}
          onItemUpdate={setItem}
          storeHistory={storeHistory}
        />
      )}

      {item && (
        <CategoryPickerDialog
          open={categoryPickerOpen}
          onOpenChange={setCategoryPickerOpen}
          currentCategory={(item.item_category as ItemCategoryId | null) ?? null}
          currentSubType={item.sub_type}
          onPick={(category, subType) => void handlePickCategory(category, subType)}
        />
      )}

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
            onDelete={() => setConfirmDeleteOpen(true)}
            deleting={deleting}
            sidebarMode
            onRoomCreated={(room) => setRooms((prev) => [...prev, room])}
          />
        </DialogContent>
      </Dialog>


      </div>

      {/* Delete confirmation — the ONLY path that actually deletes. Names the
          item and states the task consequence, because softDeleteItemUnit
          cascades: task templates are archived and open instances soft-deleted
          (completed history is preserved). */}
      <Dialog
        open={confirmDeleteOpen}
        onOpenChange={(open) => {
          if (!open && !deleting) {
            setConfirmDeleteOpen(false)
            setError(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {item.display_name}?</DialogTitle>
            <DialogDescription>
              {tasks.length > 0
                ? `Its ${tasks.length} task${tasks.length === 1 ? "" : "s"} will be archived, and it will no longer appear in your items. Completed history is kept.`
                : "It will no longer appear in your items. Completed history is kept."}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setConfirmDeleteOpen(false)
                setError(null)
              }}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
