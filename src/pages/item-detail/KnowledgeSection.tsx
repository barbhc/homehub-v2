import { useState } from "react"
import { Trash2Icon } from "lucide-react"
import { InlineError, SectionCard } from "@/components/layout"
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
  /** The saved Q&A whose delete just failed — said under that one answer. */
  const [deleteFailedId, setDeleteFailedId] = useState<string | null>(null)

  return (
    <>
      {/* Cleaning guide — still separate (not in chip tabs) */}
      {hasParsedManual && (
        <CleaningGuideCard chunks={cleaningChunks} />
      )}

      {/* Saved answers */}
      {faqs.length > 0 && (
        <SectionCard className="px-4 sm:px-6 py-0">
          <Accordion type="single" collapsible>
            <AccordionItem value="faqs" className="border-b-0">
              <AccordionTrigger>Saved answers ({faqs.length})</AccordionTrigger>
              <AccordionContent>
                <ul className="space-y-3 list-none p-0 m-0">
                  {faqs.map((faq) => (
                    <li
                      key={faq.faq_id}
                      className="rounded-[14px] border border-[var(--hh-line2)] bg-[var(--hh-surface)] p-3"
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
                          setDeleteFailedId(null)
                          const result = await deleteFaq(faq.home_id, faq.faq_id)
                          if (result.error) {
                            // The Q&A stays listed, as it still is — and now
                            // says so, instead of a Delete that did nothing
                            // (audit 2026-10-15).
                            console.warn(`[item] could not delete saved Q&A ${faq.faq_id} (home ${faq.home_id}):`, result.error.message)
                            setDeleteFailedId(faq.faq_id)
                            return
                          }
                          onFaqsChange((current) => current.filter((f) => f.faq_id !== faq.faq_id))
                        }}
                        aria-label="Delete saved answer"
                      >
                        <Trash2Icon className="size-3" aria-hidden />
                        Delete
                      </Button>
                      {deleteFailedId === faq.faq_id && (
                        <InlineError save>Couldn't delete it. Try again.</InlineError>
                      )}
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
