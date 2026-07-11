import { BookOpenIcon, ChevronDownIcon } from "lucide-react"
import { useState } from "react"
import { SectionCard } from "@/components/layout"
import type { KnowledgeChunk } from "@/integrations/types"
import { cn } from "@/lib/utils"
import { StepCard } from "./StepCard"

/** Break a long prose block into readable paragraphs at sentence boundaries. */
function formatProse(text: string): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []

  // If it already has newlines forming paragraphs, use those
  const paragraphs = trimmed.split(/\n\s*\n/).filter(Boolean)
  if (paragraphs.length > 1) return paragraphs.map((p) => p.trim())

  // Otherwise, split at sentence boundaries — group every 2-3 sentences
  const sentences = trimmed.split(/(?<=[.!?])\s+(?=[A-Z])/)
  if (sentences.length <= 3) return [trimmed]

  const groups: string[] = []
  for (let i = 0; i < sentences.length; i += 2) {
    groups.push(sentences.slice(i, i + 2).join(" "))
  }
  return groups
}

interface HowToAccordionProps {
  chunks: KnowledgeChunk[]
  onOpenManualPage?: (page: number, chunkId: string) => void
}

/** Parses "1. … 2. …" as lines or inline segments; returns null if not a numbered list. */
function parseNumberedSteps(content: string): string[] | null {
  const t = content.trim()
  if (!t) return null

  // Try line-based parsing first (e.g. "1. Do this\n2. Do that")
  const lineSteps: string[] = []
  for (const line of t.split(/\n/)) {
    const m = line.trim().match(/^(\d+)[.)]\s+(.+)$/)
    if (m) lineSteps.push(m[2].trim())
  }
  if (lineSteps.length >= 2) return lineSteps

  // Try inline parsing: split before each "N. " or "N) " pattern
  // Handles content like "1. Open door. 2. Slide rack in. 3. Close door."
  // or "Open door. 2. Slide rack in. 3. Close door." (no number on first step)
  const segments = t.split(/(?:^|\s+)(?=\d+[.)]\s)/)
    .map((s) => s.replace(/^\d+[.)]\s+/, "").trim())
    .filter(Boolean)
  if (segments.length >= 2) return segments

  // Try splitting on sentence-boundary step numbers: ". 2. " patterns
  // Handles "With the dryer door open, slide rack in. 2. Make sure it is seated..."
  const sentenceSplit = t.split(/\.\s+(?=\d+[.)]\s)/)
  if (sentenceSplit.length >= 2) {
    return sentenceSplit.map((s, i) => {
      let step = s.replace(/^\d+[.)]\s+/, "").trim()
      // Re-add trailing period stripped by the split (except last segment which keeps it)
      if (i < sentenceSplit.length - 1 && !step.endsWith(".")) step += "."
      return step
    }).filter(Boolean)
  }

  return null
}

export function HowToAccordion({ chunks, onOpenManualPage }: HowToAccordionProps) {
  if (chunks.length === 0) return null

  const [expandedId, setExpandedId] = useState<string | null>(null)

  return (
    <SectionCard id="howto-section" className="p-4 sm:p-6 scroll-mt-6">
      <h2 className="font-medium mb-3">How To</h2>
      <div className="space-y-2">
        {chunks.map((chunk) => {
          const sourcePages = chunk.source_pages ?? []
          const steps = parseNumberedSteps(chunk.content)
          const isExpanded = expandedId === chunk.chunk_id
          const stepCount = steps?.length ?? 0

          return (
            <div
              key={chunk.chunk_id}
              className={cn(
                "bg-white/55 backdrop-blur-sm border border-white/70 rounded-[14px] transition-all duration-200 overflow-hidden",
                "hover:bg-white/75 hover:-translate-y-px hover:shadow-md",
                isExpanded && "bg-white/80 shadow-md"
              )}
            >
              <div className="flex">
                {/* Left accent bar */}
                <div className="w-1 rounded-full self-stretch shrink-0 my-2 ml-2 bg-gradient-to-b from-sky-400 to-sky-500" />

                <div className="flex-1 min-w-0">
                  {/* Title row */}
                  <div className="flex items-start gap-2 px-3 pt-3 pb-1">
                    <button
                      type="button"
                      className="text-[13px] sm:text-sm font-semibold flex-1 min-w-0 text-left leading-snug"
                      onClick={() => setExpandedId(isExpanded ? null : chunk.chunk_id)}
                    >
                      {chunk.title ?? "How to use this feature"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : chunk.chunk_id)}
                      className="h-6 w-6 p-0 flex items-center justify-center text-muted-foreground/50 hover:text-foreground transition-colors shrink-0 mt-px"
                      title={isExpanded ? "Collapse" : "Expand steps"}
                    >
                      <ChevronDownIcon className={cn("size-4 transition-transform", isExpanded && "rotate-180")} />
                    </button>
                  </div>

                  {/* Meta row */}
                  <div className="flex items-center gap-x-3 px-3 pb-2.5">
                    {stepCount > 0 && (
                      <span className="text-[11px] text-muted-foreground">{stepCount} step{stepCount === 1 ? "" : "s"}</span>
                    )}
                    {sourcePages.length > 0 && (
                      <span className="text-[11px] text-muted-foreground">p. {sourcePages.join(", ")}</span>
                    )}
                  </div>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="border-t border-border/30 px-4 py-3 space-y-3">
                      {steps ? (
                        <div className="space-y-2.5">
                          {steps.map((text, i) => (
                            <StepCard key={i} index={i} text={text} />
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          {formatProse(chunk.content).map((para, i) => (
                            <p key={i} className="text-sm text-muted-foreground leading-relaxed">
                              {para}
                            </p>
                          ))}
                        </div>
                      )}
                      {sourcePages.length > 0 && onOpenManualPage && (
                        <button
                          type="button"
                          onClick={() => onOpenManualPage(sourcePages[0], chunk.chunk_id)}
                          className="flex items-center gap-2 w-full rounded-lg bg-sky-500/5 hover:bg-sky-500/10 px-3 py-2 transition-colors"
                        >
                          <BookOpenIcon className="size-4 text-sky-500" />
                          <span className="text-sm font-medium text-sky-600">
                            View in manual — page {sourcePages[0]}
                          </span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </SectionCard>
  )
}
