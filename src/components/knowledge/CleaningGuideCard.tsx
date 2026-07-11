import { SectionCard } from "@/components/layout"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { KnowledgeChunk } from "@/integrations/types"
import { StepCard } from "./StepCard"

interface CleaningGuideCardProps {
  chunks: KnowledgeChunk[]
}

function parseContent(content: string): { steps: string[]; supplies: string[] } | null {
  try {
    const parsed = JSON.parse(content) as { steps?: string[]; supplies?: string[] }
    if (Array.isArray(parsed?.steps)) {
      return {
        steps: parsed.steps,
        supplies: Array.isArray(parsed.supplies) ? parsed.supplies : [],
      }
    }
    return null
  } catch {
    return null
  }
}

function hasTag(chunk: KnowledgeChunk, tag: string): boolean {
  const tags = chunk.tags
  if (Array.isArray(tags)) return tags.some((t) => String(t) === tag)
  return false
}

export function CleaningGuideCard({ chunks }: CleaningGuideCardProps) {
  if (chunks.length === 0) return null

  const weeklyChunk = chunks.find((c) => hasTag(c, "weekly"))
  const deepCleanChunk = chunks.find((c) => hasTag(c, "deep_clean"))

  const weekly = weeklyChunk ? parseContent(weeklyChunk.content) : null
  const deepClean = deepCleanChunk ? parseContent(deepCleanChunk.content) : null

  if (!weekly && !deepClean) return null

  return (
    <SectionCard className="p-4 sm:p-6">
      <h2 className="font-medium mb-3">Cleaning Guide</h2>
      <Tabs defaultValue={weekly ? "weekly" : "deep_clean"} className="w-full">
        <TabsList>
          {weekly && <TabsTrigger value="weekly">Weekly</TabsTrigger>}
          {deepClean && <TabsTrigger value="deep_clean">Deep Clean</TabsTrigger>}
        </TabsList>
        {weekly && (
          <TabsContent value="weekly" className="mt-3">
            <div className="space-y-3">
              {weekly.steps.map((step, i) => (
                <StepCard key={i} index={i} text={step} />
              ))}
            </div>
            {weekly.supplies.length > 0 && (
              <div className="mt-4 pt-3 border-t border-white/50">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70 mb-1">
                  Supplies needed
                </p>
                <p className="text-sm text-muted-foreground">{weekly.supplies.join(" · ")}</p>
              </div>
            )}
          </TabsContent>
        )}
        {deepClean && (
          <TabsContent value="deep_clean" className="mt-3">
            <div className="space-y-3">
              {deepClean.steps.map((step, i) => (
                <StepCard key={i} index={i} text={step} />
              ))}
            </div>
            {deepClean.supplies.length > 0 && (
              <div className="mt-4 pt-3 border-t border-white/50">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70 mb-1">
                  Supplies needed
                </p>
                <p className="text-sm text-muted-foreground">{deepClean.supplies.join(" · ")}</p>
              </div>
            )}
          </TabsContent>
        )}
      </Tabs>
    </SectionCard>
  )
}
