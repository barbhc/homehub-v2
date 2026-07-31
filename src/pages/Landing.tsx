import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import {
  HouseIcon,
  MailIcon,
  PackageIcon,
  ListChecksIcon,
  ShieldCheckIcon,
  SparklesIcon,
  WindIcon,
  RefrigeratorIcon,
  UtensilsIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"

// Landing page — version C (utility / feature-forward) from design/hh-landing.jsx
// (LandingUtility). Marketing surface at "/". Mobile matches the mockup exactly;
// at lg+ it expands to a desktop layout (two-column hero, 2-up features, 3-up
// steps). All preview data is static illustration.

const TEAL = "#1B6B5A"
const INK = "#0B1220"
const SUB = "#5A6663"
const HERO_BG = "radial-gradient(120% 80% at 50% 0%, #1B6B5A 0%, #0E1B17 60%)"

function TopBar({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="flex items-center justify-between px-[22px] pt-[calc(env(safe-area-inset-top)+20px)] lg:px-2 lg:pt-5">
      <div className="flex items-center gap-2.5">
        <div className="flex items-center justify-center" style={{ width: 30, height: 30, borderRadius: 9, background: "linear-gradient(150deg,#1B6B5A,#2D9B82)" }}>
          <HouseIcon size={17} strokeWidth={2} className="text-white" />
        </div>
        <span className="text-[17px] font-extrabold tracking-[-0.3px] text-white">Homehub</span>
      </div>
      <button onClick={onSignIn} className="text-sm font-bold text-white/85">Sign in</button>
    </div>
  )
}

/** Email + CTA. Submitting hands the email to /signup. `alignLeftLg` left-aligns
 *  it on desktop (hero); otherwise it stays centered (CTA card). */
function SignupRow({ cta = "Get started", onGo, alignLeftLg }: { cta?: string; onGo: (email: string) => void; alignLeftLg?: boolean }) {
  const [email, setEmail] = useState("")
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onGo(email) }}
      className={cn("flex flex-wrap gap-2 max-w-[380px] mx-auto", alignLeftLg && "lg:mx-0")}
    >
      <div className="flex-1 min-w-0 flex items-center gap-2.5 rounded-[13px] px-3.5" style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.22)" }}>
        <MailIcon size={16} className="shrink-0" style={{ color: "rgba(255,255,255,0.6)" }} />
        <input
          type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com" autoComplete="email"
          className="flex-1 min-w-0 border-none outline-none bg-transparent py-[14px] text-[15px] text-white placeholder:text-white/45"
        />
      </div>
      <button type="submit" className="shrink-0 rounded-[13px] px-5 h-[50px] text-[15px] font-bold text-white" style={{ background: TEAL }}>
        {cta}
      </button>
    </form>
  )
}

/** Illustrative in-app preview — static sample data, never a live fetch. */
function PhoneMock() {
  return (
    <div className="mx-auto" style={{ width: 285, borderRadius: 39, background: "#0A0C0B", padding: 8, boxShadow: "0 30px 60px rgba(11,26,22,0.30)" }}>
      <div style={{ borderRadius: 32, overflow: "hidden", background: "#F3F5F4" }}>
        <div className="px-[17px] pt-[18px]">
          <div className="flex justify-between items-center mb-3.5">
            <div style={{ width: 62, height: 9, borderRadius: 4, background: "#0A0C0B" }} />
            <div className="flex gap-[3px]">{[0, 1, 2].map((i) => <div key={i} style={{ width: 5, height: 9, borderRadius: 1, background: "#9AA6A2" }} />)}</div>
          </div>
          <div className="text-[10px] font-bold tracking-[0.4px]" style={{ color: TEAL }}>TUESDAY</div>
          <div className="text-[20px] font-extrabold tracking-[-0.5px]" style={{ color: INK }}>Good morning, Barb</div>
        </div>
        <div className="mx-[17px] my-3.5 bg-white p-3.5" style={{ borderRadius: 18, boxShadow: "0 6px 18px rgba(11,26,22,0.08)" }}>
          <div className="flex justify-between mb-2.5">
            <span className="text-[9px] font-bold tracking-[0.3px] px-2 py-1 rounded-full" style={{ color: "#C2410C", background: "#FFF1E8" }}>ESSENTIAL</span>
            <span className="text-[9.5px] font-bold" style={{ color: TEAL }}>Today · 2 min</span>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center shrink-0" style={{ width: 38, height: 38, borderRadius: 12, background: "#EAF3EF" }}>
              <WindIcon size={19} style={{ color: TEAL }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-extrabold tracking-[-0.2px]" style={{ color: INK }}>Replace the HVAC filter</div>
              <div className="text-[10.5px] mt-0.5" style={{ color: SUB }}>Furnace &amp; A/C · Utility</div>
            </div>
            <div className="shrink-0" style={{ width: 24, height: 24, borderRadius: 12, border: `2px solid ${TEAL}` }} />
          </div>
        </div>
        <div className="mx-[17px] mb-[18px]">
          {[
            { Icon: RefrigeratorIcon, t: "Clean fridge coils", w: "In 4 days" },
            { Icon: UtensilsIcon, t: "Dishwasher clean cycle", w: "In 9 days" },
          ].map(({ Icon, t, w }) => (
            <div key={t} className="flex items-center gap-2.5 py-2">
              <div className="flex items-center justify-center shrink-0" style={{ width: 29, height: 29, borderRadius: 9, background: "#EEF2F1" }}>
                <Icon size={14} style={{ color: TEAL }} />
              </div>
              <div className="flex-1 text-[12.5px] font-semibold" style={{ color: INK }}>{t}</div>
              <div className="text-[10px] font-semibold" style={{ color: "#9AA6A2" }}>{w}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const FEATURES = [
  { Icon: PackageIcon, kicker: "Inventory", t: "Every appliance, organized", s: "Scan a label or snap a photo. Homehub identifies the model and files it by room." },
  { Icon: ListChecksIcon, kicker: "Maintenance", t: "A schedule that builds itself", s: "From your real manuals, not generic advice — with calm reminders so nothing slips." },
  { Icon: ShieldCheckIcon, kicker: "Warranties", t: "Coverage you won't forget", s: "See what's protected and what's lapsing soon, all in one tidy list." },
  { Icon: SparklesIcon, kicker: "Ask", t: "Answers from your manuals", s: "Ask a question to any item's manual and get a clear, sourced answer in seconds." },
]

const STEPS: [string, string, string][] = [
  ["1", "Add your home's items", "Photo, scan, or search — a few taps each."],
  ["2", "We build the care plan", "Tailored to your manuals and your home."],
  ["3", "Stay ahead, calmly", "Get proactive reminders on maintenance tasks."],
]

export default function Landing() {
  const navigate = useNavigate()
  const goSignup = (email: string) => navigate("/signup", { state: email.trim() ? { email: email.trim() } : undefined })

  return (
    <div className="min-h-[100dvh] bg-white" style={{ color: INK }}>
      {/* ── Dark hero (full-bleed) ── */}
      <section style={{ background: HERO_BG }} className="text-white">
        <div className="mx-auto max-w-[480px] lg:max-w-[1080px] lg:px-8">
          <TopBar onSignIn={() => navigate("/signin")} />
          <div className="px-6 pt-[34px] pb-10 lg:px-0 lg:pt-14 lg:pb-20 lg:flex lg:items-center lg:gap-12">
            <div className="text-center lg:text-left lg:flex-1">
              <h1 className="text-[38px] lg:text-[52px] font-extrabold leading-[1.1] tracking-[-1px] text-balance">
                Everything your home needs, in one place.
              </h1>
              <p className="text-[16.5px] lg:text-[18px] leading-[1.5] mt-4 mb-6 max-w-[340px] lg:max-w-[420px] mx-auto lg:mx-0" style={{ color: "rgba(255,255,255,0.78)" }}>
                Items, manuals, warranties, maintenance and a built-in assistant — organized to effortlessly care for your home.
              </p>
              <SignupRow onGo={goSignup} alignLeftLg />
            </div>
            <div className="mt-[38px] lg:mt-0 lg:flex-1 lg:flex lg:justify-center">
              <PhoneMock />
            </div>
          </div>
        </div>
      </section>

      {/* ── Feature list (full-bleed light) ── */}
      <section style={{ background: "#F7F8F8" }}>
        <div className="mx-auto max-w-[480px] lg:max-w-[1000px] px-6 lg:px-8">
          <div className="pt-7 lg:pt-16 pb-1.5 lg:pb-6 text-center">
            <h2 className="text-[26px] lg:text-[32px] font-extrabold tracking-[-0.6px]">Built around your home</h2>
          </div>
          <div className="lg:grid lg:grid-cols-2 lg:gap-x-14 lg:gap-y-2">
            {FEATURES.map((f, i) => (
              <div key={f.kicker}>
                {i > 0 && <div className="h-px lg:hidden" style={{ background: "rgba(15,23,42,0.07)" }} />}
                <div className={cn("flex items-center gap-4 py-[18px] lg:py-7", i % 2 === 1 && "flex-row-reverse lg:flex-row")}>
                  <div className="flex items-center justify-center shrink-0" style={{ width: 76, height: 76, borderRadius: 20, background: "#EAF3EF" }}>
                    <f.Icon size={34} strokeWidth={1.6} style={{ color: TEAL }} />
                  </div>
                  <div className="flex-1">
                    <div className="text-[11px] font-bold uppercase tracking-[0.5px] mb-1" style={{ color: TEAL }}>{f.kicker}</div>
                    <div className="text-[18px] font-extrabold tracking-[-0.3px]" style={{ color: INK }}>{f.t}</div>
                    <div className="text-[14px] leading-[1.5] mt-1" style={{ color: SUB }}>{f.s}</div>
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
          <h2 className="text-[26px] lg:text-[32px] font-extrabold tracking-[-0.6px] text-center mb-5 lg:mb-10">Up and running in minutes</h2>
          <div className="lg:grid lg:grid-cols-3 lg:gap-10">
            {STEPS.map(([n, t, s], i) => (
              <div key={n} className={cn("flex gap-[15px] lg:flex-col lg:items-center lg:gap-3", i === STEPS.length - 1 ? "" : "pb-[18px] lg:pb-0")}>
                <div className="flex flex-col items-center">
                  <div className="flex items-center justify-center shrink-0 text-white text-[15px] font-extrabold" style={{ width: 34, height: 34, borderRadius: "50%", background: TEAL }}>{n}</div>
                  {i < STEPS.length - 1 && <div className="flex-1 w-0.5 mt-1 lg:hidden" style={{ background: "rgba(15,23,42,0.1)" }} />}
                </div>
                <div className="pt-1 lg:pt-1 lg:text-center">
                  <div className="text-[17px] font-extrabold tracking-[-0.3px]" style={{ color: INK }}>{t}</div>
                  <div className="text-[14px] leading-[1.5] mt-0.5 lg:max-w-[240px]" style={{ color: SUB }}>{s}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Closing CTA ── */}
      <section>
        <div className="mx-auto max-w-[480px] lg:max-w-[760px] px-6 lg:px-8 pt-[30px] lg:pt-16 pb-11 lg:pb-20">
          <div className="text-center text-white" style={{ background: "linear-gradient(150deg,#1B6B5A,#0E1B17)", borderRadius: 24, padding: 28 }}>
            <h2 className="text-[25px] lg:text-[30px] font-extrabold tracking-[-0.5px] mb-2">Create your free account</h2>
            <p className="text-[14.5px] lg:text-[16px] leading-[1.5] mb-5 lg:max-w-[440px] lg:mx-auto" style={{ color: "rgba(255,255,255,0.74)" }}>
              Start keeping your home in order — add your first item in minutes.
            </p>
            <SignupRow cta="Sign up" onGo={goSignup} />
          </div>
          <div className="mt-[26px] text-center text-[12.5px]" style={{ color: SUB }}>
            © Homehub ·{" "}
            <Link to="/privacy" className="underline underline-offset-2">Privacy</Link> ·{" "}
            <Link to="/terms" className="underline underline-offset-2">Terms</Link>
          </div>
        </div>
      </section>
    </div>
  )
}
