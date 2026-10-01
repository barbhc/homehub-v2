import { Skeleton } from "@/components/ui/skeleton"
import { dens } from "@/lib/redesign/tokens"

const SUB = "var(--hh-sub)", LINE = "var(--hh-line)", SURFACE = "var(--hh-surface)"
/** ThisWeekList's open-row fill and edges, so the first row reads as open while it loads. */
const WASH = "color-mix(in srgb, var(--hh-teal) 12%, var(--hh-surface))"
const EDGE = "color-mix(in srgb, var(--hh-teal) 45%, transparent)"

/**
 * Home while its first read is in flight, shaped like the Home it turns into
 * (design/home-focus.md): the greeting, the Ask bar, and ONE list — *This week*
 * — with the first task open, then `All tasks`. RefinedHome on phones,
 * DesktopHome at lg+, CSS picking one, the way ItemsSkeleton does.
 *
 * The skeleton this replaces drew the retired Home: a greeting, then a band of
 * three stat tiles over two big blocks — so every cold start showed one page
 * and landed on another.
 *
 * It only appears when there is nothing at all to paint (shouldShowHomeSkeleton).
 * Past SKELETON_PATIENCE_MS it says so, because shimmer alone reads as a
 * broken screen: a tester reported exactly this as "a blank Home Screen".
 */
export function HomeSkeleton({ patienceExpired = false }: { patienceExpired?: boolean }) {
  return (
    <div className="flex flex-col pb-8" data-testid="home-skeleton">
      <div className="px-4 lg:px-8 max-w-5xl mx-auto w-full">
        <div className="lg:hidden -mx-4">
          <div className="mx-auto w-full max-w-[460px]">
            <PhoneSkeleton patienceExpired={patienceExpired} />
          </div>
        </div>
        <div className="hidden lg:block">
          <DesktopSkeleton patienceExpired={patienceExpired} />
        </div>
      </div>
    </div>
  )
}

/** Screen-reader status for the load, and — once the wait is long — the visible note. */
function LoadingStatus({ patienceExpired }: { patienceExpired: boolean }) {
  return (
    <div role="status">
      <span className="sr-only">Loading your home…</span>
      {patienceExpired && (
        <div
          className="rounded-xl border px-3.5 py-3 text-[13px]"
          style={{ borderColor: LINE, background: SURFACE, color: SUB }}
        >
          Still setting up your home — this can take a moment on a first sign-in
          or a slow connection.
        </div>
      )}
    </div>
  )
}

/** RefinedHome: greeting (and the home pill under it) with the date on the right, the Ask bar, the list. */
function PhoneSkeleton({ patienceExpired }: { patienceExpired: boolean }) {
  const d = dens("cozy")
  return (
    <div className="flex min-h-full flex-col" style={{ background: "var(--hh-bg)" }}>
      <div className="flex items-start justify-between pt-3" style={{ paddingInline: d.pad }} aria-hidden="true">
        <div>
          <Skeleton className="h-[22px] w-48" />
          <Skeleton className="mt-1.5 h-[22px] w-28 rounded-full" />
        </div>
        <Skeleton className="mt-1 h-3.5 w-20" />
      </div>
      <div className="flex flex-1 flex-col pt-4" style={{ paddingInline: d.pad }}>
        <LoadingStatus patienceExpired={patienceExpired} />
        <div className="flex flex-col" style={{ gap: d.stack }} aria-hidden="true">
          <Skeleton className="h-[54px] rounded-[18px]" />
          <WeekListSkeleton variant="mobile" />
        </div>
      </div>
    </div>
  )
}

/** DesktopHome: the date and the greeting with the Ask pill beside them, then the list —
 *  inside the same 1180px breakout DesktopHome uses, so nothing moves when it lands. */
function DesktopSkeleton({ patienceExpired }: { patienceExpired: boolean }) {
  return (
    <div className="mx-[calc(50%-50vw)] w-screen">
      <div className="mx-auto w-full max-w-[1180px] px-7 pb-10 pt-[26px]">
        <div className="mb-6 flex items-center justify-between gap-4" aria-hidden="true">
          <div>
            <Skeleton className="h-3.5 w-44" />
            <Skeleton className="mt-2 h-8 w-80" />
          </div>
          <Skeleton className="h-10 w-36 shrink-0 rounded-full" />
        </div>
        <div className="max-w-md">
          <LoadingStatus patienceExpired={patienceExpired} />
        </div>
        <div aria-hidden="true">
          <WeekListSkeleton variant="desktop" />
        </div>
      </div>
    </div>
  )
}

const SCALE = {
  mobile: { rowPad: "px-3.5 py-3", bodyPad: "pl-[46px] pr-3.5 pb-3.5" },
  desktop: { rowPad: "px-5 py-3.5", bodyPad: "pl-[58px] pr-5 pb-4" },
} as const

/** ThisWeekList's shape: the label, one card, the first row open, three closed, the footer. */
function WeekListSkeleton({ variant }: { variant: keyof typeof SCALE }) {
  const sc = SCALE[variant]
  return (
    <section className="flex flex-col gap-2.5" data-testid="home-skeleton-week">
      <Skeleton className="ml-0.5 h-3 w-[72px]" />
      <div className="overflow-hidden rounded-2xl border shadow-[0_1px_2px_rgba(15,23,42,0.04)]" style={{ background: SURFACE, borderColor: LINE }}>
        <div data-open="true" style={{ background: WASH, boxShadow: `inset 2px 0 0 ${EDGE}, inset -2px 0 0 ${EDGE}` }}>
          <div className={`flex items-center gap-2.5 ${sc.rowPad}`}>
            <Skeleton className="size-6 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-[18px] w-3/4" />
              <Skeleton className="mt-1.5 h-3 w-1/3" />
            </div>
          </div>
          <div className={`flex flex-col gap-2.5 ${sc.bodyPad}`}>
            <div className="flex gap-1.5">
              {[64, 72, 52].map((w) => (
                <Skeleton key={w} className="h-[26px] rounded-full" style={{ width: w }} />
              ))}
            </div>
            <div className="flex items-center gap-2 pt-0.5">
              <Skeleton className="h-[34px] w-[98px] rounded-[11px]" />
              <Skeleton className="h-[34px] w-[86px] rounded-[11px]" />
              <Skeleton className="ml-auto h-3 w-20" />
            </div>
          </div>
        </div>
        {[70, 58, 64].map((w) => (
          <div key={w} data-open="false" className={`flex items-center gap-2.5 ${sc.rowPad}`} style={{ borderTop: `1px solid ${LINE}` }}>
            <Skeleton className="size-6 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-3.5" style={{ width: `${w}%` }} />
              <Skeleton className="mt-1.5 h-3" style={{ width: `${w - 30}%` }} />
            </div>
          </div>
        ))}
        <div className="flex justify-end px-3.5 py-2.5" style={{ borderTop: `1px solid ${LINE}` }}>
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
    </section>
  )
}
