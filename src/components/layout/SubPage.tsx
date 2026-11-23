import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import { ChevronLeftIcon } from "lucide-react"
import { PageContainer } from "./PageContainer"

/**
 * A page one step under a tab: a back link to where it was opened from, its
 * name, then its content in one readable column (design/settings-your-home.md).
 * Settings' pages, Rooms and "Your own tasks" share it with Your home's look.
 *
 * The back link is 44pt tall; the heading's leading is unitless so Larger Text
 * grows the line instead of clipping it.
 */
export function SubPage({ backTo, backLabel, title, testId, children }: {
  backTo: string
  /** The page the link returns to, by its tab or menu name ("Settings", "Items"). */
  backLabel: string
  title: string
  testId?: string
  children: ReactNode
}) {
  return (
    <PageContainer>
      <div className="mx-auto w-full max-w-[640px] pb-10" data-testid={testId}>
        <div className="mb-2 flex items-center">
          <Link to={backTo} className="flex min-h-11 items-center gap-1 text-[0.9375rem] font-semibold leading-[1.33]" style={{ color: "var(--hh-teal)" }}>
            <ChevronLeftIcon className="size-4" aria-hidden /> {backLabel}
          </Link>
        </div>
        <h1 className="text-[1.75rem] font-extrabold leading-[1.2] tracking-[-0.5px]" style={{ color: "var(--hh-ink)" }}>{title}</h1>
        <div className="mt-5">{children}</div>
      </div>
    </PageContainer>
  )
}
