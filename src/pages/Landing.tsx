import { Link, useNavigate } from "react-router-dom"
import {
  HouseIcon,
  PackageIcon,
  ListChecksIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"

// Landing page — version C (utility / feature-forward) from design/hh-landing.jsx
// (LandingUtility). Marketing surface at "/". Mobile matches the mockup exactly;
// at lg+ it expands to a desktop layout (two-column hero, 2-up features, 3-up
// steps). All preview data is static illustration.

// Tokens, so the page follows the theme like the app it advertises. The hero
// and closing card are a dark brand band in both themes; the phone mock draws
// the app in whichever theme the visitor is using.
const TEAL = "var(--hh-teal)"
const TEAL_FILL = "var(--hh-teal-fill)"
const INK = "var(--hh-ink)"
const SUB = "var(--hh-sub)"
const HERO_BG = "var(--hh-hero)"

function TopBar({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="flex items-center justify-between px-[22px] pt-[calc(env(safe-area-inset-top)+20px)] lg:px-2 lg:pt-5">
      <div className="flex items-center gap-2.5">
        <div className="flex items-center justify-center" style={{ width: 30, height: 30, borderRadius: 9, background: "var(--hh-mark)" }}>
          <HouseIcon size={17} strokeWidth={2} className="text-white" />
        </div>
        <span className="text-[1.0625rem] font-extrabold tracking-[-0.3px] text-white">Homehub</span>
      </div>
      <button onClick={onSignIn} className="hit-44 text-sm font-bold text-white/85">Sign in</button>
    </div>
  )
}

/** Get started: straight into the first minute (zip → area → list). There is
 *  nothing to type yet — the account is asked for once they have a list to
 *  keep (design/account-after-list.md), so the old email box had no job. */
function GetStarted({ alignLeftLg }: { alignLeftLg?: boolean }) {
  return (
    <Link
      to="/onboarding/first"
      className={cn("flex h-[50px] w-full max-w-[340px] items-center justify-center mx-auto rounded-[13px] text-[0.9375rem] font-bold text-white", alignLeftLg && "lg:mx-0")}
      style={{ background: TEAL_FILL }}
    >
      Get started
    </Link>
  )
}

/**
 * The first list a new person sees (seventeen fixes, mock m6): a REAL capture
 * of the first minute's "Worth doing this month" for a house in 94110, taken
 * from the emulator, in the visitor's theme. It replaced a drawn Home that no
 * longer matched the app. Same bezel, size and place as the drawing.
 */
const FIRST_LIST_ALT = "Homehub's first list for a house in 94110: Worth doing this month. Nothing is added until you tap Add."

function PhoneMock() {
  return (
    // design-rules: allow raw-color — the phone's bezel is drawn hardware, black in both themes.
    <div className="mx-auto" style={{ width: 285, borderRadius: 39, background: "#0A0C0B", padding: 8, boxShadow: "0 30px 60px rgba(11,26,22,0.30)" }}>
      <div style={{ borderRadius: 32, overflow: "hidden", background: "var(--hh-bg)" }} data-testid="landing-phone">
        <img src="/landing/first-list-light.webp" width={269} height={386} alt={FIRST_LIST_ALT} className="block h-auto w-full dark:hidden" />
        <img src="/landing/first-list-dark.webp" width={269} height={386} alt={FIRST_LIST_ALT} className="hidden h-auto w-full dark:block" />
      </div>
    </div>
  )
}

// Most compelling first (owner, 2026-11-27): Maintenance, Ask, Warranties, then
// Inventory — the same order and titles as the marketing page (public/beta.html).
const FEATURES = [
  { Icon: ListChecksIcon, t: "A schedule that builds itself", s: "Common upkeep for what most homes have, plus the exact schedule from your manual when you add one. Proactive reminders so nothing slips." },
  { Icon: SparklesIcon, t: "Answers about your home", s: "Ask about anything you own. With its manual you get a clear, sourced answer; without one, general guidance." },
  { Icon: ShieldCheckIcon, t: "Know what’s still under warranty", s: "One list of what’s covered and what runs out soon. Each item shows the date its coverage ends." },
  { Icon: PackageIcon, t: "Every appliance, organized", s: "Model, purchase date, warranty and manual for every appliance, kept in one place." },
]

const STEPS: [string, string, string][] = [
  ["1", "Set up in a minute", "Your zip code and type of home are all it takes to get started."],
  ["2", "We build the care plan", "Tailored to your home, your climate and what you own."],
  ["3", "Stay ahead, calmly", "Get proactive reminders on maintenance tasks."],
]

export default function Landing() {
  const navigate = useNavigate()

  return (
    <div className="min-h-[100dvh]" style={{ background: "var(--hh-surface)", color: INK }}>
      {/* ── Dark hero (full-bleed) ── */}
      <section style={{ background: HERO_BG }} className="text-white">
        <div className="mx-auto max-w-[480px] lg:max-w-[1080px] lg:px-8">
          <TopBar onSignIn={() => navigate("/signin")} />
          <div className="px-6 pt-[34px] pb-10 lg:px-0 lg:pt-14 lg:pb-20 lg:flex lg:items-center lg:gap-12">
            <div className="text-center lg:text-left lg:flex-1">
              {/* Larger Text: the headline grows at most 1.5x — titles grow less
                  than body text on iOS, and its longest word must still fit a phone. */}
              <h1 className="text-[length:min(2.375rem,57px)] lg:text-[length:min(3.25rem,78px)] font-extrabold leading-[1.1] tracking-[-1px] text-balance">
                See what your home needs this month.
              </h1>
              <p className="text-[1.03125rem] lg:text-[1.125rem] leading-[1.5] mt-4 mb-6 max-w-[340px] lg:max-w-[420px] mx-auto lg:mx-0" style={{ color: "rgba(255,255,255,0.78)" }}>
                Enter your zip and the kind of home you have. Homehub gives you the few tasks that matter this month and reminds you when they&rsquo;re due.
              </p>
              <GetStarted alignLeftLg />
            </div>
            <div className="mt-[38px] lg:mt-0 lg:flex-1 lg:flex lg:justify-center">
              <PhoneMock />
            </div>
          </div>
        </div>
      </section>

      {/* ── Feature list (full-bleed light) ── */}
      <section style={{ background: "var(--hh-surface2)" }}>
        <div className="mx-auto max-w-[480px] lg:max-w-[1000px] px-6 lg:px-8">
          <div className="pt-7 lg:pt-16 pb-1.5 lg:pb-6 text-center">
            <h2 className="text-[1.625rem] lg:text-[2rem] font-extrabold tracking-[-0.6px]">What Homehub does</h2>
          </div>
          <div className="lg:grid lg:grid-cols-2 lg:gap-x-14 lg:gap-y-2">
            {FEATURES.map((f, i) => (
              <div key={f.t}>
                {i > 0 && <div className="h-px lg:hidden" style={{ background: "var(--hh-line)" }} />}
                <div className={cn("flex items-center gap-4 py-[18px] lg:py-7", i % 2 === 1 && "flex-row-reverse lg:flex-row")}>
                  <div className="flex items-center justify-center shrink-0" style={{ width: 76, height: 76, borderRadius: 20, background: "var(--hh-teal-wash)" }}>
                    <f.Icon size={34} strokeWidth={1.6} style={{ color: TEAL }} />
                  </div>
                  <div className="flex-1">
                    <div className="text-[1.125rem] font-extrabold tracking-[-0.3px]" style={{ color: INK }}>{f.t}</div>
                    <div className="text-[0.875rem] leading-[1.5] mt-1" style={{ color: SUB }}>{f.s}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="h-6" />
        </div>
      </section>

      {/* ── How it works ── */}
      <section>
        <div className="mx-auto max-w-[480px] lg:max-w-[1000px] px-6 lg:px-8 pt-[34px] lg:pt-16 pb-1.5">
          <h2 className="text-[1.625rem] lg:text-[2rem] font-extrabold tracking-[-0.6px] text-center mb-5 lg:mb-10">Up and running in minutes</h2>
          <div className="lg:grid lg:grid-cols-3 lg:gap-10">
            {STEPS.map(([n, t, s], i) => (
              <div key={n} className={cn("flex gap-[15px] lg:flex-col lg:items-center lg:gap-3", i === STEPS.length - 1 ? "" : "pb-[18px] lg:pb-0")}>
                <div className="flex flex-col items-center">
                  <div className="flex items-center justify-center shrink-0 text-white text-[0.9375rem] font-extrabold" style={{ width: 34, height: 34, borderRadius: "50%", background: TEAL_FILL }}>{n}</div>
                  {i < STEPS.length - 1 && <div className="flex-1 w-0.5 mt-1 lg:hidden" style={{ background: "var(--hh-line2)" }} />}
                </div>
                <div className="pt-1 lg:pt-1 lg:text-center">
                  <div className="text-[1.0625rem] font-extrabold tracking-[-0.3px]" style={{ color: INK }}>{t}</div>
                  <div className="text-[0.875rem] leading-[1.5] mt-0.5 lg:max-w-[240px]" style={{ color: SUB }}>{s}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Closing CTA ── */}
      <section>
        <div className="mx-auto max-w-[480px] lg:max-w-[760px] px-6 lg:px-8 pt-[30px] lg:pt-16 pb-11 lg:pb-20">
          <div className="text-center text-white" style={{ background: "var(--hh-hero-card)", borderRadius: 24, padding: 28 }}>
            <h2 className="text-[1.5625rem] lg:text-[1.875rem] font-extrabold tracking-[-0.5px] mb-2">Start with your zip</h2>
            <p className="text-[0.90625rem] lg:text-[1rem] leading-[1.5] mb-5 lg:max-w-[440px] lg:mx-auto" style={{ color: "rgba(255,255,255,0.74)" }}>
              Your zip, your kind of home, then a short list. Free.
            </p>
            <GetStarted />
          </div>
          <div className="mt-[26px] text-center text-[0.78125rem]" style={{ color: SUB }}>
            © Homehub ·{" "}
            <Link to="/privacy" className="underline underline-offset-2">Privacy</Link> ·{" "}
            <Link to="/terms" className="underline underline-offset-2">Terms</Link>
          </div>
        </div>
      </section>
    </div>
  )
}
