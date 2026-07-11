import { SectionCard } from "@/components/layout"
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion"
import type { KnowledgeChunk } from "@/integrations/types"

interface SpecsSectionProps {
  specsChunks: KnowledgeChunk[]
  hasBrandOrModel: boolean
}

export function SpecsSection({ specsChunks, hasBrandOrModel }: SpecsSectionProps) {
  if (specsChunks.length === 0) return null

  return (
    <SectionCard id="specs-section" className="px-4 sm:px-6 py-0 scroll-mt-6">
      <Accordion type="single" collapsible>
        <AccordionItem value="specs" className="border-b-0">
          <AccordionTrigger>From your manual</AccordionTrigger>
          <AccordionContent>
            {!hasBrandOrModel && (
              <p className="text-sm text-muted-foreground mb-3 bg-white/40 border border-white/50 rounded-xl px-3 py-2">
                Some item details above may be fillable from your manual specs.
              </p>
            )}
            <dl className="space-y-2 text-sm">
              {specsChunks.map((c) => (
                <div key={c.chunk_id}>
                  <dt className="font-medium">{c.title || "Spec"}</dt>
                  <dd className="text-muted-foreground ml-0">{c.content}</dd>
                </div>
              ))}
            </dl>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </SectionCard>
  )
}
