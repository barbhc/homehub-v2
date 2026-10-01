import { useEffect, useState, useRef } from "react"
import { ReviewItemTasksButton, type ReviewItemTasksHandle } from "@/components/manuals/ReviewItemTasksButton"
import { ParsePickupCard } from "@/components/manuals/ParsePickupCard"
import { itemManualState } from "@/lib/manualReviewState"
import { useItemManuals } from "@/hooks/useItemManuals"
import { useNotificationsBlocked } from "@/hooks/useNotificationsBlocked"
import { useParams, useNavigate, useSearchParams } from "react-router-dom"
import { PageContainer, EmptyState } from "@/components/layout"
import { useAuth } from "@/modules/auth"
import { useCurrentHome } from "@/modules/home"
import { softDeleteItemUnit, updateItemUnit } from "@/modules/items"
import { getTaskTemplatesWithSchedulesByItem } from "@/modules/care"
import { getChunksByItem, updateChunkSourcePages } from "@/modules/knowledge"
import { useManualManagement, useManualUrls } from "@/hooks/useManualManagement"
import { useIsDesktop } from "@/hooks/useIsDesktop"
import { track } from "@/lib/analytics"
import { collection, getDocs, query, where } from "firebase/firestore"
import { db } from "@/integrations/firebase"
import { ManualDockPanel } from "@/components/care/ManualDockPanel"
import { RefinedItemDetail } from "@/components/home/RefinedItemDetail"
import { ItemDetailsSheet } from "@/components/item-care/ItemDetailsSheet"
import { RoomPickerDialog } from "@/components/home/RoomPickerDialog"
import { dueScans, unqueueScan } from "@/lib/scanCapacity"
import { startParse } from "@/modules/knowledge/services/parseManualService"
import { CategoryPickerDialog } from "@/components/home/CategoryPickerDialog"
import { getCategoryDefinition, type ItemCategoryId } from "@/modules/inventory/constants/itemCategories"
import { DesktopItemDetail } from "@/components/home/DesktopItemDetail"
import { CloudOffIcon, Trash2, XIcon } from "lucide-react"
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
import { useItemDetailLoad } from "./item-detail/useItemDetailLoad"
import { useDepsChanged } from "@/hooks/useDepsChanged"

export default function ItemDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  // A buy-ahead push (or any link) can name the task: /items/{id}?task={templateId}.
  const focusTaskId = searchParams.get("task")
  const { home } = useCurrentHome()
  const { user } = useAuth()

  // HH-161: the item's manuals, LIVE — the one account of every read on this
  // page. Upkeep, the Ask card, the hand-off card and both trees read it, and
  // nothing patches a copy of it by hand.
  const live = useItemManuals(home?.home_id, id)
  const manuals = live.manuals
  // The page's own load (HH-160) — its state and its data — lives in one hook,
  // apart from actionError below. It is ready when the live manuals are too, so
  // the page never draws "No upkeep yet" for the moment before they answer.
  const load = useItemDetailLoad(home?.home_id, id, { status: live.status, count: manuals.length })
  const {
    item, setItem,
    tasks, setTasks,
    chunks, setChunks,
    rooms, setRooms,
    faqs, setFaqs,
  } = load
  // "See page X" links open the newest manual's PDF. Same resolver (and cache
  // entry) the manual section uses for its "Open manual" links.
  const manualUrls = useManualUrls(manuals)
  const manualPdfUrl = manuals[0] ? manualUrls[manuals[0].manual_id] ?? null : null
  const notificationsBlocked = useNotificationsBlocked()
  /** What a delete, room or category change on this page reported. Never the
   *  load's state — a stall message in this slot is what sat over a page that
   *  had loaded fine (HH-160). */
  const [actionError, setActionError] = useState<string | null>(null)
  // HH-157: a row's Edit opens the same review the Review tasks button does.
  const reviewRef = useRef<ReviewItemTasksHandle>(null)
  const [allHomeTags, setAllHomeTags] = useState<string[]>([])
  const [deleting, setDeleting] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [knowledgeManualPageOpen, setKnowledgeManualPageOpen] = useState(false)
  const [knowledgeManualPage, setKnowledgeManualPage] = useState(1)
  const [knowledgeChunkId, setKnowledgeChunkId] = useState<string | null>(null)
  // Resizable manual dock (design option 4): size is vw on desktop, vh on mobile.
  const [manualDockSize, setManualDockSize] = useState(42)
  // HH-159: which ONE tree this page renders, and which way the dock opens.
  const isDesktop = useIsDesktop()
  // Bump to force HistorySection to refetch. Nothing triggers it since the
  // legacy layout was removed; kept as the section's refreshKey input.
  const [historyKey] = useState(0)
  const [editOpen, setEditOpen] = useState(false)
  const [roomPickerOpen, setRoomPickerOpen] = useState(false)
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [storeHistory, setStoreHistory] = useState<(string | null | undefined)[]>([])

  // HH-124, the client half of the queue. A scan the daily ceiling refused is
  // remembered; this starts it again when the item is opened, which is the fast
  // path — the hourly `retryAwaitingCapacity` job covers the app being closed.
  //
  // Because BOTH halves now exist, this checks before it charges. The server
  // may already have restarted the manual, and calling startParse on one that
  // is queued, running or done would spend another 10 units re-parsing a
  // manual nobody asked to re-parse. So the local queue defers to whatever
  // Firestore says: anything other than `awaiting_capacity` means it has an
  // owner already, and the local entry is simply forgotten.
  useEffect(() => {
    if (!home || !id) return
    const due = dueScans(Date.now()).filter((e) => e.itemUnitId === id)
    if (due.length === 0) return
    let cancelled = false
    void (async () => {
      for (const entry of due) {
        const known = manuals.find((m) => m.manual_id === entry.manualId)
        // Absent from the snapshot means "not loaded yet", not "gone" — leave
        // it queued and try on a later render rather than dropping it.
        if (!known) continue
        if (known.parse_stage !== "awaiting_capacity") {
          unqueueScan(entry.manualId)
          continue
        }
        const res = await startParse(entry.manualId, { homeId: home.home_id, mode: "preview" })
        if (cancelled) return
        // Only forget it once it actually started. A second refusal leaves it
        // queued for the next visit rather than silently dropping it.
        if (res.ok) unqueueScan(entry.manualId)
      }
    })()
    return () => { cancelled = true }
  }, [home, id, manuals])

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
      .catch((e: unknown) => {
        // Non-fatal — both autocompletes just stay empty — but logged.
        console.warn(`[item] could not read the home's tags and stores for autocomplete:`, e instanceof Error ? e.message : e)
      })
    return () => { cancelled = true }
  }, [home])

  // --- Extracted hooks ---
  const manualMgmt = useManualManagement({
    itemId: id ?? "",
    homeId: home?.home_id ?? "",
    userId: user?.id,
    setChunks,
    setTasks,
  })

  // The page's reads live in useItemDetailLoad. What is no longer here is a
  // scan started on load: the page re-enqueued a preview parse for every manual
  // with no parsed_at created in the last ten minutes — which is every manual
  // the wizard had just handed over, already enqueued by SmartAddItem's
  // startParseAndLeave. enqueueParse charges before it checks anything, so each
  // add with a manual was charged twice, and again on every refetch inside those
  // ten minutes. The wizard starts the read and this page watches it (its live
  // manuals) — docs/add-item-flow.md, "started and never awaited".

  /** A review was saved: its tasks and its chunks (tips, specs, guides) are on
   *  the item now. The manual's own state arrives through the live list. */
  const refreshAfterReview = () => {
    if (!home || !id) return
    void Promise.all([
      getTaskTemplatesWithSchedulesByItem(home.home_id, id),
      getChunksByItem(home.home_id, id),
    ]).then(([t, c]) => {
      if (t.data) setTasks(t.data)
      if (c.data) setChunks(c.data)
      // Saved either way; a failed refresh shows the page as it was until the
      // next visit, and says why in the console rather than nowhere.
      if (t.error || c.error) console.error("[item] could not refresh after the review:", t.error?.message ?? c.error?.message)
    })
  }

  // Deep-link: arriving via /items/:id?manualPage=N (from a task's "From your
  // manual · p.N" reference) auto-opens the manual viewer at that page — in
  // the render that has both the link and the PDF.
  const deepLinkPage = searchParams.get("manualPage")
  if (useDepsChanged([deepLinkPage, manualPdfUrl], { onMount: true }) && deepLinkPage && manualPdfUrl) {
    const page = Number(deepLinkPage)
    if (Number.isFinite(page) && page > 0) {
      setKnowledgeManualPage(page)
      setKnowledgeChunkId(null)
      setKnowledgeManualPageOpen(true)
    }
  }
  // Consume the param once the PDF is loaded so it doesn't re-open on
  // back/rerender. Changing the URL is a side effect, so it stays an effect.
  useEffect(() => {
    if (!searchParams.get("manualPage") || !manualPdfUrl) return
    const next = new URLSearchParams(searchParams)
    next.delete("manualPage")
    setSearchParams(next, { replace: true })
  }, [manualPdfUrl, searchParams, setSearchParams])

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
      setActionError(`Could not delete item: ${result.error}`)
    }
  }

  // Only for an item this page has not shown yet — a refetch (Try again, a task
  // added) keeps the page on screen instead of swapping it for this (HH-160).
  if (load.showSkeleton) {
    return (
      <PageContainer>
        {/* The item's own shape while it loads, not the word "Loading" on an
            empty screen — the approved round-19 mock. */}
        <div className="animate-pulse py-2" aria-busy="true" aria-label="Loading this item">
          <div className="h-7 w-3/5 rounded-md bg-muted" />
          <div className="mt-2 h-4 w-2/5 rounded-md bg-muted/70" />
          <div className="mt-5 h-[60px] rounded-xl bg-muted/60" />
          <div className="mt-3 h-[60px] rounded-xl bg-muted/60" />
        </div>
        {/* HH-160: slow is not failed. The request is still running and still
            wins if it lands; this only offers a fresh start meanwhile. */}
        {load.status === "slow" && (
          <div className="mt-6 flex flex-col items-center gap-3 text-center" role="status">
            <p className="text-[13px]" style={{ color: "var(--hh-sub)" }}>Still loading…</p>
            <button
              type="button"
              onClick={load.reload}
              className="rounded-xl border px-4 py-2 text-[13.5px] font-bold"
              style={{ borderColor: "var(--hh-line2)", color: "var(--hh-teal)" }}
            >
              Try again
            </button>
          </div>
        )}
      </PageContainer>
    )
  }

  // A failed load is a dead end without this — the page previously showed the
  // spinner forever and offered no way out.
  if (load.showDeadEnd) {
    return (
      <PageContainer>
        <div className="py-16 text-center">
          <p className="text-[15px] font-semibold text-foreground">Could not load this item.</p>
          <p className="mt-1 text-[13px] text-muted-foreground">{load.loadError}</p>
          <button
            type="button"
            onClick={load.reload}
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
  // ONE account of the manuals for the whole page (HH-161): saved, being read
  // (HH-87), or read and waiting for its review (HH-141). Both trees get this
  // object; neither recomputes it.
  // "Starting": this page is handing a manual to the reader, and the worker's
  // own stage has not reached the live list yet (see startedReadPending).
  const startingRead =
    manualMgmt.parsePhase || manualMgmt.parsingManualId !== null || manualMgmt.startedReadPending(manuals)
  const manualState = itemManualState(manuals, startingRead)
  const hasParsedManual = manualState.hasManual

  // The hand-off (HH-161): a finished read, delivered to its review — rendered
  // INSIDE the one tree, between the name and Upkeep, never above the page.
  const handoff = home && id ? (
    <ParsePickupCard
      homeId={home.home_id}
      itemUnitId={id}
      itemName={item.display_name || "This item"}
      manuals={manuals}
      watched={live.watched}
      onReviewSaved={refreshAfterReview}
    />
  ) : null

  // Task splitting (setup / habit / regular) moved into RefinedItemDetail's
  // CareBlock and DesktopItemDetail when the legacy layout was retired — this
  // page just passes `tasks` through.

  // The brand is CONTEXT for the review's title, so prepend it — unless the name
  // already carries it, which every composed name has since #139.
  // Unconditional prepending produced "LG LG DLGX3901B" across the review sheet
  // and the add dialog (owner's round-9 screenshot).
  const reviewItemName =
    (item.brand && !item.display_name?.toLowerCase().includes(item.brand.toLowerCase())
      ? `${item.brand} ${item.display_name ?? ""}`.trim()
      : item.display_name) || "This item"

  const manualSectionProps = {
    homeId: home?.home_id ?? "",
    brand: item?.brand ?? null,
    model: item?.model ?? null,
    manuals,
    addManualOpen: manualMgmt.addManualOpen,
    setAddManualOpen: manualMgmt.setAddManualOpen,
    addMode: manualMgmt.addMode,
    addRole: manualMgmt.addRole,
    setAddRole: manualMgmt.setAddRole,
    titleInput: manualMgmt.titleInput,
    setTitleInput: manualMgmt.setTitleInput,
    labelInput: manualMgmt.labelInput,
    setLabelInput: manualMgmt.setLabelInput,
    addError: manualMgmt.addError,
    setAddError: manualMgmt.setAddError,
    addLoading: manualMgmt.addLoading,
    parsePhase: manualMgmt.parsePhase,
    parsingManualId: manualMgmt.parsingManualId,
    deletingManualId: manualMgmt.deletingManualId,
    handleOpenAddManual: manualMgmt.handleOpenAddManual,
    handleAddManual: manualMgmt.handleAddManual,
    handleReadManual: manualMgmt.handleReadManual,
    handleFillGaps: manualMgmt.handleFillGaps,
    handleDeleteManual: manualMgmt.handleDeleteManual,
  }

  const handlePickRoom = async (roomId: string | null) => {
    if (!home || !item) return
    const prev = item
    setItem({ ...item, room_id: roomId })
    const res = await updateItemUnit(home.home_id, item.item_unit_id, { room_id: roomId })
    if (res.error) {
      setItem(prev)
      setActionError(`Could not change the room: ${res.error.message}`)
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
      setActionError(`Could not change the category: ${res.error.message}`)
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

  return (
    <div
      style={{
        paddingRight: dockOpen && isDesktop ? `${manualDockSize}vw` : undefined,
        paddingBottom: dockOpen && !isDesktop ? `${manualDockSize}vh` : undefined,
        transition: "padding 140ms ease",
      }}
    >
      <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      {manualMgmt.parseNotice && (
        // A throttled scan, waiting to retry itself. Teal and undismissable on
        // purpose: it resolves on its own in a few seconds, and it is NOT the
        // amber error style below — dressing a pause as a failure is what
        // HH-145 was reported for.
        <div className="flex items-start gap-2 rounded-lg px-4 py-2 text-sm mb-4"
          style={{ background: "var(--hh-teal-wash)", color: "var(--hh-teal)" }}>
          <span className="min-w-0 flex-1">{manualMgmt.parseNotice}</span>
        </div>
      )}
      {load.status === "failed" && (
        // A REFETCH failed with the item already on screen (the first load
        // failing is the dead end above). What is shown is still true, only not
        // fresh, so this is a quiet note — Home's pattern — not the amber error.
        <div className="mb-4 flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5"
          style={{ borderColor: "var(--hh-line)", background: "var(--hh-surface)" }}>
          <CloudOffIcon className="size-4 shrink-0" style={{ color: "var(--hh-sub)" }} aria-hidden />
          <span className="min-w-0 flex-1 text-[12.5px]" style={{ color: "var(--hh-sub)" }}>
            Couldn&apos;t refresh this item — showing what we had.
          </span>
          <button type="button" onClick={load.reload} className="shrink-0 text-[12.5px] font-bold" style={{ color: "var(--hh-teal)" }}>
            Try again
          </button>
        </div>
      )}
      {(actionError || manualMgmt.parseError) && (
        // Dismissible. A parse error explains itself once and then just sits
        // there — a tester asked how to clear it and there was no way, so a
        // message about one failed upload followed him around the item forever.
        // Action and parse errors only: the page's own load never writes here
        // (HH-160 — a stall message sat here over a page that had loaded).
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-2 text-sm text-amber-800 dark:text-amber-200 mb-4">
          <span className="min-w-0 flex-1">{actionError || manualMgmt.parseError}</span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => {
              setActionError(null)
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

      {live.status === "failed" && (
        // The manuals listener could not start (a rules or network refusal).
        // The rest of the item is real, so it stays; only the manual's state is
        // unknown, and the page says that instead of guessing it.
        <div className="mb-4 flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5"
          style={{ borderColor: "var(--hh-line)", background: "var(--hh-surface)" }}>
          <CloudOffIcon className="size-4 shrink-0" style={{ color: "var(--hh-sub)" }} aria-hidden />
          <span className="min-w-0 flex-1 text-[12.5px]" style={{ color: "var(--hh-sub)" }}>
            Couldn&apos;t load this item&apos;s manuals.
          </span>
          <button type="button" onClick={live.retry} className="shrink-0 text-[12.5px] font-bold" style={{ color: "var(--hh-teal)" }}>
            Try again
          </button>
        </div>
      )}

      {/* Redesigned item detail — RefinedItemDetail (phone) OR DesktopItemDetail
          (lg+), never both. Both used to mount, with CSS hiding one; but each
          renders its own ManualSection, whose dialog and review sheet are
          portaled out from under the `display:none`, so one tap opened two of
          each (HH-159; HH-120 back again). */}
      {isDesktop ? (
        <DesktopItemDetail
          key={item.item_unit_id}
          onTaskAdded={load.reload}
          item={item}
          rooms={rooms}
          homeId={home!.home_id}
          tasks={tasks}
          chunks={chunks}
          manualState={manualState}
          notificationsBlocked={notificationsBlocked}
          handoffSlot={handoff}
          faqs={faqs}
          historyKey={historyKey}
          onBack={() => navigate("/inventory")}
          onEdit={() => setEditOpen(true)}
          onOpenManualPage={(page) => openManualPage(page)}
          onItemUpdate={setItem}
          manualSectionProps={manualSectionProps}
          focusTaskId={focusTaskId}
        />
      ) : (
      <div className="-mx-4 sm:-mx-6">
        <div className="mx-auto w-full max-w-[460px]">
          <RefinedItemDetail
            key={item.item_unit_id}
            onTaskAdded={load.reload}
          onEditTask={() => reviewRef.current?.open()}
            item={item}
            rooms={rooms}
            homeId={home!.home_id}
            tasks={tasks}
            chunks={chunks}
            manualState={manualState}
            notificationsBlocked={notificationsBlocked}
            handoffSlot={handoff}
            onBack={() => navigate("/inventory")}
            onOpenManualPage={(page) => openManualPage(page)}
            canOpenManual={!!manualPdfUrl}
            // The Upkeep door. Through handleOpenAddManual like every other
            // door, so it opens on upload with the last error and role reset.
            onAddManual={() => manualMgmt.handleOpenAddManual("upload")}
            onEditCategory={() => setCategoryPickerOpen(true)}
            onItemUpdate={setItem}
            onEditRoom={() => setRoomPickerOpen(true)}
            onEditDetails={() => setDetailsOpen(true)}
            focusTaskId={focusTaskId}
            reviewAction={
              home && id && tasks.length > 0 ? (
                <ReviewItemTasksButton
                  ref={reviewRef}
                  homeId={home.home_id}
                  itemUnitId={id}
                  itemName={reviewItemName}
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
      )}

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
            setActionError(null)
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
          {actionError && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {actionError}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setConfirmDeleteOpen(false)
                setActionError(null)
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
