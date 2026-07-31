import { Link } from "react-router-dom"
import { ChevronLeftIcon } from "lucide-react"

/**
 * Shared chrome for the Privacy Policy and Terms of Service.
 *
 * These are public and must render for someone who is NOT signed in: App Store
 * Connect requires a reachable Privacy Policy URL, and a reviewer opens it
 * logged out. So they sit outside AuthGate, and nothing here may touch the
 * user/home context.
 */
export function LegalPage({
  title,
  effective,
  children,
}: {
  title: string
  effective: string
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen" style={{ background: "var(--hh-bg)" }}>
      <div className="mx-auto w-full max-w-[720px] px-5 py-6 pb-20">
        <Link
          to="/"
          className="inline-flex items-center gap-0.5 py-1.5 text-[15px] font-semibold"
          style={{ color: "var(--hh-teal)" }}
        >
          <ChevronLeftIcon className="size-[20px]" strokeWidth={2.4} /> Homehub
        </Link>

        <h1
          className="mt-4 text-[30px] font-extrabold tracking-[-0.6px]"
          style={{ color: "var(--hh-ink)" }}
        >
          {title}
        </h1>
        <p className="mt-1.5 text-[13.5px]" style={{ color: "var(--hh-sub)" }}>
          Effective {effective}
        </p>

        <div
          className="mt-7 flex flex-col gap-6 text-[15px] leading-relaxed"
          style={{ color: "var(--hh-ink)" }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

export function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="text-[18px] font-extrabold tracking-[-0.3px]" style={{ color: "var(--hh-ink)" }}>
        {heading}
      </h2>
      {children}
    </section>
  )
}

export function P({ children }: { children: React.ReactNode }) {
  return <p style={{ color: "var(--hh-sub)" }}>{children}</p>
}

export function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="flex list-disc flex-col gap-1.5 pl-5" style={{ color: "var(--hh-sub)" }}>
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  )
}

/** Third-party processor row — name, what reaches them, and why. */
export function Processors({ rows }: { rows: { name: string; data: string; why: string }[] }) {
  return (
    <div
      className="overflow-hidden rounded-2xl border"
      style={{ borderColor: "var(--hh-line)", background: "var(--hh-surface)" }}
    >
      {rows.map((r, i) => (
        <div
          key={r.name}
          className="px-4 py-3"
          style={{ borderTop: i === 0 ? "none" : "1px solid var(--hh-line)" }}
        >
          <div className="text-[14.5px] font-bold" style={{ color: "var(--hh-ink)" }}>{r.name}</div>
          <div className="mt-0.5 text-[13.5px]" style={{ color: "var(--hh-sub)" }}>
            <span className="font-semibold">What they receive:</span> {r.data}
          </div>
          <div className="text-[13.5px]" style={{ color: "var(--hh-sub)" }}>
            <span className="font-semibold">Why:</span> {r.why}
          </div>
        </div>
      ))}
    </div>
  )
}
