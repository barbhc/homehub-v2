import { BookOpenIcon, ChevronDownIcon } from "lucide-react"
import { useState } from "react"
import { SectionCard } from "@/components/layout"
import type { KnowledgeChunk } from "@/integrations/types"
import { cn } from "@/lib/utils"

/** Break a long prose block into readable paragraphs at sentence boundaries. */
function formatProse(text: string): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  const paragraphs = trimmed.split(/\n\s*\n/).filter(Boolean)
  if (paragraphs.length > 1) return paragraphs.map((p) => p.trim())
  const sentences = trimmed.split(/(?<=[.!?])\s+(?=[A-Z])/)
  if (sentences.length <= 3) return [trimmed]
  const groups: string[] = []
  for (let i = 0; i < sentences.length; i += 2) {
    groups.push(sentences.slice(i, i + 2).join(" "))
  }
  return groups
}

interface TroubleshootingAccordionProps {
  chunks: KnowledgeChunk[]
  onOpenManualPage?: (page: number, chunkId: string) => void
}

function parseStructured(content: string): { symptom?: string; cause?: string; fix?: string } | null {
  const symptomMatch = content.match(/Symptom:\s*([^.]+\.?)/i)
  const causeMatch = content.match(/Cause:\s*([^.]+\.?)/i)
  const fixMatch = content.match(/Fix:\s*([^.]+\.?)/i)
  if (symptomMatch && causeMatch && fixMatch) {
    return {
      symptom: symptomMatch[1].trim(),
      cause: causeMatch[1].trim(),
      fix: fixMatch[1].trim(),
    }
  }
  return null
}

export function TroubleshootingAccordion({ chunks, onOpenManualPage }: TroubleshootingAccordionProps) {
  if (chunks.length === 0) return null

  const [expandedId, setExpandedId] = useState<string | null>(null)

  return (
    <SectionCard id="troubleshooting-section" className="p-4 sm:p-6 scroll-mt-6">
      <h2 className="font-medium mb-3">Troubleshooting</h2>
      <div className="space-y-2">
        {chunks.map((chunk) => {
          const sourcePages = chunk.source_pages ?? []
          const structured = parseStructured(chunk.content)
          const isExpanded = expandedId === chunk.chunk_id

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
                <div className="w-1 rounded-full self-stretch shrink-0 my-2 ml-2 bg-gradient-to-b from-orange-400 to-orange-500" />

                <div className="flex-1 min-w-0">
                  {/* Title row */}
                  <div className="flex items-start gap-2 px-3 pt-3 pb-1">
                    <button
                      type="button"
                      className="text-[13px] sm:text-sm font-semibold flex-1 min-w-0 text-left leading-snug"
                      onClick={() => setExpandedId(isExpanded ? null : chunk.chunk_id)}
                    >
                      {(chunk.title ?? "Issue").replace(/^Troubleshooting\s*[—–-]\s*/i, "")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : chunk.chunk_id)}
                      className="h-6 w-6 p-0 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors shrink-0 mt-px"
                      title={isExpanded ? "Collapse" : "Expand details"}
                    >
                      <ChevronDownIcon className={cn("size-4 transition-transform", isExpanded && "rotate-180")} />
                    </button>
                  </div>

                  {/* Meta row */}
                  <div className="flex items-center gap-x-3 px-3 pb-2.5">
                    {sourcePages.length > 0 && (
                      <span className="text-[11px] text-muted-foreground">p. {sourcePages.join(", ")}</span>
                    )}
                  </div>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="border-t border-border/30 px-4 py-3 space-y-3">
                      {structured ? (
                        <div className="space-y-2 text-sm leading-relaxed">
                          <div className="flex gap-2 items-start">
                            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-orange-600 mt-0.5 w-16">Symptom</span>
                            <p className="text-muted-foreground">{structured.symptom}</p>
                          </div>
                          <div className="flex gap-2 items-start">
                            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-orange-600 mt-0.5 w-16">Cause</span>
                            <p className="text-muted-foreground">{structured.cause}</p>
                          </div>
                          <div className="flex gap-2 items-start">
                            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-orange-600 mt-0.5 w-16">Fix</span>
                            <p className="text-muted-foreground">{structured.fix}</p>
                          </div>
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
                          className="flex items-center gap-2 w-full rounded-lg bg-orange-500/5 hover:bg-orange-500/10 px-3 py-2 transition-colors"
                        >
                          <BookOpenIcon className="size-4 text-orange-500" />
                          <span className="text-sm font-medium text-orange-600">
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
