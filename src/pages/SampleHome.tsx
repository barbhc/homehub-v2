import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import {
  AlertTriangleIcon,
  ChevronLeftIcon,
  BookOpenTextIcon,
  ChevronDownIcon,
  ClockIcon,
  PackageIcon,
  ShieldCheckIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * A furnished home you can poke at before you own one.
 *
 * The pitch — photograph an appliance, Homehub reads its manual, you get the
 * care jobs that manual actually specifies — is impossible to evaluate from an
 * empty app. The first screen a new user saw was a naming form: commit first,
 * find out second. This is the "find out first" half.
 *
 * Deliberately NOT a second copy of the app. It is one page of fixtures with
 * shallow interaction (expand a task, expand an item), sharing the app's
 * primitives and tokens. Building it out of the real dashboard would mean a
 * demo data layer threaded through every service — the parallel-component-tree
 * mistake that made v1 expensive, arriving through a side door. Nothing here
 * touches Firestore, so it costs nothing and cannot fail.
 */

type SampleTask = {
  title: string
  item: string
  /** Window phrase, NEVER a day count — the sample teaches the app's real
   *  vocabulary (HH-78): "Been a while", "This week", "Sep-ish". */
  when: string
  tier: "essential" | "recommended" | "optional"
  cadence: string
  minutes: number
  why: string
  how: string
  source: string
}

const TASKS: SampleTask[] = [
  {
    title: "Replace the furnace filter",
    item: "Carrier Infinity Furnace",
    when: "Been a while",
    tier: "essential",
    cadence: "Every 3 months",
    minutes: 10,
    why: "A clogged filter strains the blower, cuts efficiency, and shortens the furnace's life.",
    how: "Switch the furnace off at the thermostat. Slide the old filter out of the return duct, noting the airflow arrow. Slide the new one in facing the same way.",
    source: "Carrier Infinity 59MN7 manual, p. 34",
  },
  {
    title: "Test the smoke & CO detectors",
    item: "Whole home",
    when: "This week",
    tier: "essential",
    cadence: "Monthly",
    minutes: 10,
    why: "Working detectors are your first warning in a fire or a carbon-monoxide leak.",
    how: "Press and hold the test button on each detector until it sounds. Replace any battery that produces a weak alarm or none at all.",
    source: "Added by Homehub as a whole-home safety task",
  },
  {
    title: "Clean the dishwasher filter",
    item: "Bosch 800 Series Dishwasher",
    when: "This month",
    tier: "optional",
    cadence: "Monthly",
    minutes: 5,
    why: "Food debris in the filter damages the pump and leaves dishes gritty.",
    how: "Twist the cylindrical filter counter-clockwise and lift it out with the flat screen beneath. Rinse both under warm water and refit until the filter clicks.",
    source: "Bosch SHPM88Z75N manual, p. 20",
  },
  {
    title: "Flush the water heater",
    item: "Rheem Performance Water Heater",
    when: "Sep-ish",
    tier: "recommended",
    cadence: "Yearly",
    minutes: 45,
    why: "Sediment builds up on the tank floor, shortening its life and raising your energy bill.",
    how: "Cut the power or gas, attach a hose to the drain valve, and run it to a drain until the water is clear.",
    source: "Rheem XE50T10 manual, p. 18",
  },
]

type SampleItem = {
  name: string
  brand: string
  room: string
  model: string
  tasks: string[]
  note: string
}

const ITEMS: SampleItem[] = [
  {
    name: "Bosch 800 Series Dishwasher",
    brand: "Bosch",
    model: "SHPM88Z75N",
    room: "Kitchen",
    tasks: ["Clean the filter — monthly", "Clean the spray arms — quarterly", "Descale — twice a year"],
    note: "Read from the manual. Adding rinse aid didn't become a reminder — that's using the dishwasher, not maintaining it.",
  },
  {
    name: "Carrier Infinity Furnace",
    brand: "Carrier",
    model: "59MN7",
    room: "Garage",
    tasks: ["Replace the filter — monthly", "Book the annual service — every autumn"],
    note: "Gas appliance, so the manual's combustion checks stayed as reading, not as jobs for you to do.",
  },
  {
    name: "LG French Door Refrigerator",
    brand: "LG",
    model: "LRFVS3006S",
    room: "Kitchen",
    tasks: ["Vacuum the condenser coils — twice a year", "Replace the water filter — every 6 months"],
    note: "Still under warranty until March 2028 — Homehub tracks that from the purchase date.",
  },
]

/** The app's tier rails — clay/teal/slate, exactly as TierBadge and the item
 *  page use them. The sample was inventing its own urgency dots and saying
 *  "5 days overdue", which is the vocabulary the due-window redesign removed:
 *  the demo must not pitch a harsher app than the one being sold. */
const TIER_RAIL: Record<SampleTask["tier"], string> = {
  essential: "var(--hh-clay)",
  recommended: "var(--hh-teal)",
  optional: "var(--hh-slate)",
}

function Banner({ bottom = false }: { bottom?: boolean }) {
  // Top: a quiet chip — the sample should look like the product, not like a
  // warning about it. Bottom: the exit, styled as the app's primary action.
  if (!bottom) {
    return (
      <div className="rounded-xl px-3.5 py-2.5 text-[12.5px] font-bold"
        style={{ background: "var(--hh-slate-soft)", color: "var(--hh-slate)" }}>
        Sample home — look around, then start your own. Nothing you tap here is saved.
      </div>
    )
  }
  return (
    <div className="rounded-2xl border px-4 py-4 text-center" style={{ borderColor: "var(--hh-line)", background: "var(--hh-surface)" }}>
      <p className="text-[14px] font-bold" style={{ color: "var(--hh-ink)" }}>Everything above came from four appliance manuals.</p>
      <p className="mt-1 text-[12.5px]" style={{ color: "var(--hh-sub)" }}>Your own home starts empty and fills as you add things.</p>
      <Button asChild size="sm" className="mt-3 rounded-full font-bold">
        <Link to="/">Set up your own home →</Link>
      </Button>
    </div>
  )
}

function TaskRow({ task }: { task: SampleTask }) {
  const [open, setOpen] = useState(false)
  return (
    <li className="border-b last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 py-3.5 text-left min-h-[44px]"
      >
        <span
          className="mt-0.5 w-[3px] self-stretch min-h-[34px] shrink-0 rounded-full"
          style={{ background: TIER_RAIL[task.tier] }}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold tracking-[-0.2px]" style={{ color: "var(--hh-ink)" }}>{task.title}</span>
          <span className="mt-0.5 block text-[12px]" style={{ color: "var(--hh-sub)" }}>
            {task.when} · {task.minutes} min · {task.item}
          </span>
        </span>
        <span className="mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
          style={{ background: "var(--hh-teal-wash)", color: "var(--hh-teal)" }}>
          {task.cadence}
        </span>
        <ChevronDownIcon
          className={cn("mt-1 size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div className="pb-4 pl-5 text-sm">
          <p className="flex items-start gap-2 text-foreground">
            <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span>
              <span className="font-medium">Why this matters. </span>
              {task.why}
            </span>
          </p>
          <p className="mt-2.5 text-muted-foreground">{task.how}</p>
          <p className="mt-2.5 flex items-center gap-2 text-xs text-muted-foreground">
            <ClockIcon className="size-3.5 shrink-0" aria-hidden="true" />
            About {task.minutes} minutes
            <span aria-hidden="true">·</span>
            <BookOpenTextIcon className="size-3.5 shrink-0" aria-hidden="true" />
            {task.source}
          </p>
        </div>
      )}
    </li>
  )
}

function ItemRow({ item }: { item: SampleItem }) {
  const [open, setOpen] = useState(false)
  return (
    <li className="border-b last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 py-3.5 text-left min-h-[44px]"
      >
        <PackageIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-foreground">{item.name}</span>
          <span className="mt-0.5 block text-sm text-muted-foreground">
            {item.room} · {item.model}
          </span>
        </span>
        <ChevronDownIcon
          className={cn("mt-1 size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div className="pb-4 pl-8 text-sm">
          <p className="font-medium text-foreground">What its manual says to do</p>
          <ul className="mt-1.5 space-y-1 text-muted-foreground">
            {item.tasks.map((t) => (
              <li key={t}>· {t}</li>
            ))}
          </ul>
          <p className="mt-2.5 text-xs text-muted-foreground">{item.note}</p>
        </div>
      )}
    </li>
  )
}

export default function SampleHome() {
  const navigate = useNavigate()
  return (
    <div /* pt-safe-top: rendered OUTSIDE AppLayout, where the inset normally
       comes from — on an iPhone 17 the heading landed under the Dynamic Island */
    className="min-h-screen pt-safe-top bg-background">
      <div className="mx-auto w-full max-w-[640px] px-5 py-6 pb-16">
        {/*
          THE WAY OUT. Owner, in a pair-QA session on the preview: "I don't know
          how to get back to the home page."

          This page renders outside AppLayout — deliberately, because it has to
          work before you have a home and the nav assumes one — which also means
          it has NO bottom nav. Until now the only link off the page was "Set up
          your own home" at the very bottom, roughly two screens down, and that
          is a commitment rather than an exit: someone who arrived from their own
          Inventory to look around had nothing to press at all.

          In the browser, back exists. In the Capacitor shell there is no browser
          chrome, so there was no visible exit whatsoever. HH-108 was the same
          shape on a different screen — "I can't exit out of this window once I
          open up this Preview".

          `navigate(-1)` returns them wherever they came from, which is right for
          both doors (the Inventory empty state and onboarding). Landing here
          from a cold link has no history to pop, so that falls back to the app
          root rather than doing nothing — a back button that does nothing is
          the bug with an extra step.
        */}
        <button
          type="button"
          onClick={() => {
            if (window.history.length > 1) navigate(-1)
            else navigate("/")
          }}
          className="-ml-1.5 mb-1 inline-flex items-center gap-0.5 rounded-lg py-1 pl-1 pr-2.5 text-[15px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeftIcon className="size-[20px]" strokeWidth={2.4} aria-hidden />
          Back
        </button>

        <Banner />

        <h1 className="mt-7 text-2xl font-display font-normal text-foreground">Maple Street</h1>
        <p className="mt-1 text-muted-foreground">
          4 appliances · 2 things need doing this week
        </p>

        <section className="mt-6" aria-labelledby="sample-tasks">
          <h2 id="sample-tasks" className="text-sm font-semibold text-foreground">
            What needs doing
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Tap any job to see why it matters and where it came from.
          </p>
          <ul className="mt-2 border-t">
            {TASKS.map((t) => (
              <TaskRow key={t.title} task={t} />
            ))}
          </ul>
        </section>

        <section className="mt-8" aria-labelledby="sample-items">
          <h2 id="sample-items" className="text-sm font-semibold text-foreground">
            The things in this home
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Each one was added by photographing its label. Homehub found the manual and read it.
          </p>
          <ul className="mt-2 border-t">
            {ITEMS.map((i) => (
              <ItemRow key={i.name} item={i} />
            ))}
          </ul>
        </section>

        <section className="mt-8 rounded-xl border p-4" aria-labelledby="sample-how">
          <h2 id="sample-how" className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ShieldCheckIcon className="size-4 shrink-0" aria-hidden="true" />
            How this home got here
          </h2>
          <ol className="mt-2 space-y-1.5 text-sm text-muted-foreground">
            <li>1. Photograph the label on an appliance — the sticker with the model number.</li>
            <li>2. Homehub reads the model, finds the manual, and pulls out the care it specifies.</li>
            <li>3. You review the jobs before any of them become reminders. Nothing is added behind your back.</li>
          </ol>
          <p className="mt-2.5 text-sm text-muted-foreground">
            Your first appliance takes about two minutes. Most of that is the manual being read.
          </p>
        </section>

        <div className="mt-8">
          <Banner bottom />
        </div>
      </div>
    </div>
  )
}
