import { useEffect, useState } from "react"
import {
  ShieldCheckIcon,
  BookOpenIcon,
  SparklesIcon,
  InfoIcon,
  AlertCircleIcon,
  CalendarIcon,
} from "lucide-react"
import { supabase } from "@/integrations/shim/client"
import { cn } from "@/lib/utils"
import type { KnowledgeChunk, RiskLevel } from "@/integrations/types"
import type { TaskTemplateWithSchedule } from "@/modules/care"
import type { ParsedConfidence } from "@/modules/knowledge"

/**
 * Arc 3 PR 1 — additive briefing cards.
 *
 * This is a READ-ONLY summary layer rendered ABOVE the existing 4-bucket
 * editor. It never writes, never schedules, never calls an idempotent RPC.
 * Its job is to surface the 2–4 highest-signal things a new user should
 * notice about a parsed manual before they scroll into the detailed
 * editor underneath. The editor remains the primary correction surface.
 *
 * Low-confidence guardrail (adversarial review M-1):
 *   When `confidence.overall` is missing or < 0.5, we show a banner and
 *   hide the interpretive cards (manual tip, regular-care habit) because
 *   those depend on a confident parse. Factual cards — warranty and the
 *   at-a-glance count — still render because they don't rely on the
 *   model's interpretation of the content.
 *
 * Provenance-safe language (adversarial review H-4):
 *   The troubleshooting card is labeled "From the manual" — NEVER "common
 *   issue" — because parse output has no prevalence/ranking evidence.
 *
 * No CTAs (adversarial review H-3):
 *   The regular-care card is display-only. Reminder creation is deferred
 *   to PR 3, which will need an idempotent server path keyed by
 *   (item_unit_id, reminder_type) before any CTA ships.
 */

const LOW_CONFIDENCE_THRESHOLD = 0.5

const RISK_WEIGHT: Record<RiskLevel, number> = {
  safety: 4,
  prevent_damage: 3,
  performance: 2,
  comfort: 1,
}

interface ParseBriefingCardsProps {
  itemUnitId?: string
  chunks: KnowledgeChunk[]
  tasks: TaskTemplateWithSchedule[]
  confidence: ParsedConfidence | null
}

type WarrantyInfo = {
  durationMonths: number | null
  coverage: string | null
  purchaseDate: string | null
  expiryDate: string | null
  manufacturedYear: number | null
}

function isLowConfidence(c: ParsedConfidence | null): boolean {
  if (!c) return true
  if (typeof c.overall !== "number") return true
  return c.overall < LOW_CONFIDENCE_THRESHOLD
}

function pickTopTroubleshootingChunk(chunks: KnowledgeChunk[]): KnowledgeChunk | null {
  const trouble = chunks.filter((c) => c.chunk_type === "troubleshooting")
  if (trouble.length === 0) return null
  // Prefer chunks that parse into steps (richest structure), then longest
  // content, then first. No model-assigned prevalence exists — this is
  // purely "which one has the most to say."
  const scored = trouble
    .map((c) => {
      let score = 0
      try {
        const parsed = JSON.parse(c.content) as { steps?: unknown }
        if (Array.isArray(parsed.steps) && parsed.steps.length > 0) score += 100
      } catch {
        /* plain-text content is fine */
      }
      score += Math.min(c.content?.length ?? 0, 2000) / 100
      return { c, score }
    })
    .sort((a, b) => b.score - a.score)
  return scored[0]?.c ?? null
}

function pickRegularCareTask(tasks: TaskTemplateWithSchedule[]): TaskTemplateWithSchedule | null {
  // One essential maintenance task; tiebreak highest risk, then shortest
  // estimated_minutes so the "one habit to start with" feels quick.
  const candidates = tasks.filter(
    (t) => t.care_type !== "cleaning" && t.priority_tier === "essential"
  )
  if (candidates.length === 0) return null
  return [...candidates].sort((a, b) => {
    const riskA = RISK_WEIGHT[a.risk_level] ?? 0
    const riskB = RISK_WEIGHT[b.risk_level] ?? 0
    if (riskA !== riskB) return riskB - riskA
    const minsA = a.estimated_minutes ?? Number.MAX_SAFE_INTEGER
    const minsB = b.estimated_minutes ?? Number.MAX_SAFE_INTEGER
    return minsA - minsB
  })[0]
}

function formatExpiryDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
  } catch {
    return iso
  }
}

function deriveExpiry(w: WarrantyInfo): { iso: string; daysFromNow: number } | null {
  if (w.expiryDate) {
    try {
      const d = new Date(w.expiryDate)
      const ms = d.getTime() - Date.now()
      return { iso: w.expiryDate, daysFromNow: Math.round(ms / (1000 * 60 * 60 * 24)) }
    } catch {
      return null
    }
  }
  if (w.purchaseDate && w.durationMonths) {
    try {
      const d = new Date(w.purchaseDate)
      d.setMonth(d.getMonth() + w.durationMonths)
      const iso = d.toISOString().slice(0, 10)
      const ms = d.getTime() - Date.now()
      return { iso, daysFromNow: Math.round(ms / (1000 * 60 * 60 * 24)) }
    } catch {
      return null
    }
  }
  return null
}

function extractChunkPreview(chunk: KnowledgeChunk): string {
  try {
    const parsed = JSON.parse(chunk.content) as { steps?: string[]; summary?: string }
    if (typeof parsed.summary === "string" && parsed.summary.trim()) return parsed.summary.trim()
    if (Array.isArray(parsed.steps) && parsed.steps.length > 0) {
      return parsed.steps.slice(0, 2).join(" · ")
    }
  } catch {
    /* plain text */
  }
  return (chunk.content ?? "").slice(0, 200)
}

/* ─── Card building blocks ────────────────────────────────────────── */

function Card({
  icon,
  iconBg,
  label,
  children,
}: {
  icon: React.ReactNode
  iconBg: string
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card px-4 py-3">
      <div className="flex items-start gap-3">
        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", iconBg)}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground/70 font-medium">
            {label}
          </p>
          <div className="mt-1 text-sm text-foreground leading-snug">{children}</div>
        </div>
      </div>
    </div>
  )
}

/* ─── Main component ──────────────────────────────────────────────── */

export function ParseBriefingCards({
  itemUnitId,
  chunks,
  tasks,
  confidence,
}: ParseBriefingCardsProps) {
  const [warranty, setWarranty] = useState<WarrantyInfo | null>(null)
  const [warrantyLoading, setWarrantyLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!itemUnitId) {
        if (!cancelled) {
          setWarranty(null)
          setWarrantyLoading(false)
        }
        return
      }
      const { data, error } = await supabase
        .from("item_unit")
        .select(
          "warranty_duration_months, warranty_coverage, purchase_date, warranty_expiry_date, manufactured_year"
        )
        .eq("item_unit_id", itemUnitId)
        .maybeSingle()
      if (cancelled) return
      if (error || !data) {
        setWarranty(null)
      } else {
        setWarranty({
          durationMonths: data.warranty_duration_months ?? null,
          coverage: data.warranty_coverage ?? null,
          purchaseDate: data.purchase_date ?? null,
          expiryDate: data.warranty_expiry_date ?? null,
          manufacturedYear: data.manufactured_year ?? null,
        })
      }
      setWarrantyLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [itemUnitId])

  const lowConfidence = isLowConfidence(confidence)
  const tipChunk = lowConfidence ? null : pickTopTroubleshootingChunk(chunks)
  const careTask = lowConfidence ? null : pickRegularCareTask(tasks)

  const totalTaskCount = tasks.length
  const totalMinutes = tasks.reduce((acc, t) => acc + (t.estimated_minutes ?? 0), 0)

  const expiry = warranty ? deriveExpiry(warranty) : null
  const hasWarrantyInfo = Boolean(
    warranty && (warranty.durationMonths || warranty.expiryDate || warranty.coverage)
  )

  // Don't render anything until we know whether to show the warranty card.
  // (Avoids a flash where warranty pops in after the other cards.)
  if (warrantyLoading) return null

  const visibleCards: React.ReactNode[] = []

  if (hasWarrantyInfo && warranty) {
    visibleCards.push(
      <Card
        key="warranty"
        icon={<ShieldCheckIcon className="size-4" />}
        iconBg="bg-emerald-50 text-emerald-700"
        label="Warranty"
      >
        <div className="space-y-0.5">
          {warranty.durationMonths ? (
            <p className="font-medium">
              {warranty.durationMonths} months
              {warranty.purchaseDate ? " from purchase" : ""}
            </p>
          ) : null}
          {expiry ? (
            <p className="text-xs text-muted-foreground">
              Ends {formatExpiryDate(expiry.iso)}
              {expiry.daysFromNow >= 0 ? ` · ${expiry.daysFromNow} days left` : " · expired"}
            </p>
          ) : warranty.purchaseDate ? null : (
            <p className="text-xs text-muted-foreground">
              Add a purchase date to see when it expires.
            </p>
          )}
          {warranty.coverage ? (
            <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
              {warranty.coverage}
            </p>
          ) : null}
        </div>
      </Card>
    )
  }

  if (warranty?.manufacturedYear) {
    const thisYear = new Date().getUTCFullYear()
    const age = Math.max(0, thisYear - warranty.manufacturedYear)
    visibleCards.push(
      <Card
        key="age"
        icon={<CalendarIcon className="size-4" />}
        iconBg="bg-indigo-50 text-indigo-700"
        label="Age"
      >
        <div className="space-y-0.5">
          <p className="font-medium">
            {age === 0 ? "This year" : age === 1 ? "~1 year old" : `~${age} years old`}
          </p>
          <p className="text-xs text-muted-foreground">
            Manufactured in {warranty.manufacturedYear}
          </p>
        </div>
      </Card>
    )
  }

  if (tipChunk) {
    const preview = extractChunkPreview(tipChunk)
    visibleCards.push(
      <Card
        key="tip"
        icon={<BookOpenIcon className="size-4" />}
        iconBg="bg-orange-50 text-orange-700"
        label="From the manual: troubleshooting tip"
      >
        <div className="space-y-0.5">
          {tipChunk.title ? <p className="font-medium leading-snug">{tipChunk.title}</p> : null}
          <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
            {preview}
          </p>
        </div>
      </Card>
    )
  }

  if (careTask) {
    visibleCards.push(
      <Card
        key="care"
        icon={<SparklesIcon className="size-4" />}
        iconBg="bg-blue-50 text-blue-700"
        label="Regular care"
      >
        <div className="space-y-0.5">
          <p className="font-medium leading-snug">{careTask.title}</p>
          {careTask.estimated_minutes ? (
            <p className="text-xs text-muted-foreground">
              About {careTask.estimated_minutes} min · essential
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Essential habit</p>
          )}
        </div>
      </Card>
    )
  }

  if (totalTaskCount > 0) {
    visibleCards.push(
      <Card
        key="stat"
        icon={<InfoIcon className="size-4" />}
        iconBg="bg-muted text-muted-foreground"
        label="At a glance"
      >
        <p className="leading-snug">
          <strong className="tabular-nums">{totalTaskCount}</strong>{" "}
          {totalTaskCount === 1 ? "task" : "tasks"}
          {totalMinutes > 0 ? (
            <>
              {" "}
              · about{" "}
              <strong className="tabular-nums">{totalMinutes}</strong> min / year
            </>
          ) : null}
        </p>
      </Card>
    )
  }

  if (visibleCards.length === 0 && !lowConfidence) {
    // Nothing useful to summarize — let the editor speak for itself.
    return null
  }

  return (
    <section className="space-y-2" aria-label="Parse summary">
      {lowConfidence ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
          <AlertCircleIcon className="size-4 shrink-0 mt-0.5" />
          <p className="leading-snug">
            We had trouble parsing this manual confidently. Please skim the details below and
            adjust anything that looks wrong.
          </p>
        </div>
      ) : null}
      {visibleCards}
    </section>
  )
}
