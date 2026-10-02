import { Trash2Icon } from "lucide-react"
import { SectionCard } from "@/components/layout"
import { Button } from "@/components/ui/button"
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion"
import { CleaningGuideCard } from "@/components/knowledge"
import { deleteFaq } from "@/modules/knowledge"
import type { KnowledgeChunk, ChatFaq } from "@/integrations/types"

interface KnowledgeSectionProps {
  chunks: KnowledgeChunk[]
  faqs: ChatFaq[]
  hasParsedManual: boolean
  /**
   * Takes an UPDATE, not a list. The page stays mounted when it moves to
   * another item, and a delete answering after that move handed back THIS
   * item's list — which replaced the next item's saved Q&A with this one's.
   * Removing by id is a no-op on any other item's list.
   */
  onFaqsChange: (update: (faqs: ChatFaq[]) => ChatFaq[]) => void
}

export function KnowledgeSection({
  chunks,
  faqs,
  hasParsedManual,
  onFaqsChange,
}: KnowledgeSectionProps) {
  const cleaningChunks = chunks.filter((c) => c.chunk_type === "cleaning_guide")

  return (
    <>
      {/* Cleaning guide — still separate (not in chip tabs) */}
      {hasParsedManual && (
        <CleaningGuideCard chunks={cleaningChunks} />
      )}

      {/* Saved Q&A */}
      {faqs.length > 0 && (
        <SectionCard className="px-4 sm:px-6 py-0">
          <Accordion type="single" collapsible>
            <AccordionItem value="faqs" className="border-b-0">
              <AccordionTrigger>Saved Q&A ({faqs.length})</AccordionTrigger>
              <AccordionContent>
                <ul className="space-y-3 list-none p-0 m-0">
                  {faqs.map((faq) => (
                    <li
                      key={faq.faq_id}
                      className="border border-white/60 bg-white/40 backdrop-blur-sm rounded-[14px] p-3"
                    >
                      <p className="font-semibold text-sm">{faq.question}</p>
                      <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">
                        {faq.answer}
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2 min-h-11 min-w-11 text-destructive hover:text-destructive"
                        onClick={async () => {
                          const result = await deleteFaq(faq.home_id, faq.faq_id)
                          if (result.error) {
                            // The Q&A stays listed, as it still is; the reason is logged.
                            console.warn(`[item] could not delete saved Q&A ${faq.faq_id} (home ${faq.home_id}):`, result.error.message)
                            return
                          }
                          onFaqsChange((current) => current.filter((f) => f.faq_id !== faq.faq_id))
                        }}
                        aria-label="Delete saved Q&A"
                      >
                        <Trash2Icon className="size-3" aria-hidden />
                        Delete
                      </Button>
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </SectionCard>
      )}
    </>
  )
}
