import { useState } from "react"
import { Link } from "react-router-dom"
import {
  AlertTriangleIcon,
  BookOpenTextIcon,
  ChevronDownIcon,
  ClockIcon,
  PackageIcon,
  ShieldCheckIcon,
  SparklesIcon,
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
  when: string
  urgency: "overdue" | "soon" | "later"
  minutes: number
  why: string
  how: string
  source: string
}

const TASKS: SampleTask[] = [
  {
    title: "Replace the furnace filter",
    item: "Carrier Infinity Furnace",
    when: "5 days overdue",
    urgency: "overdue",
    minutes: 10,
    why: "A clogged filter strains the blower, cuts efficiency, and shortens the furnace's life.",
    how: "Switch the furnace off at the thermostat. Slide the old filter out of the return duct, noting the airflow arrow. Slide the new one in facing the same way.",
    source: "Carrier Infinity 59MN7 manual, p. 34",
  },
  {
    title: "Test the smoke & CO detectors",
    item: "Whole home",
    when: "Due in 2 days",
    urgency: "soon",
    minutes: 10,
    why: "Working detectors are your first warning in a fire or a carbon-monoxide leak.",
    how: "Press and hold the test button on each detector until it sounds. Replace any battery that produces a weak alarm or none at all.",
    source: "Added by Homehub as a whole-home safety task",
  },
  {
    title: "Clean the dishwasher filter",
    item: "Bosch 800 Series Dishwasher",
    when: "Due in 6 days",
    urgency: "later",
    minutes: 5,
    why: "Food debris in the filter damages the pump and leaves dishes gritty.",
    how: "Twist the cylindrical filter counter-clockwise and lift it out with the flat screen beneath. Rinse both under warm water and refit until the filter clicks.",
    source: "Bosch SHPM88Z75N manual, p. 20",
  },
  {
    title: "Flush the water heater",
    item: "Rheem Performance Water Heater",
    when: "Due in 4 weeks",
    urgency: "later",
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

const URGENCY: Record<SampleTask["urgency"], { dot: string; label: string }> = {
  overdue: { dot: "var(--hh-danger, #c2410c)", label: "text-[color:var(--hh-danger,#c2410c)]" },
  soon: { dot: "var(--hh-teal, #0f766e)", label: "text-[color:var(--hh-teal,#0f766e)]" },
  later: { dot: "var(--hh-sub, #6b7280)", label: "text-muted-foreground" },
}

function Banner({ bottom = false }: { bottom?: boolean }) {
  return (
    <div className="rounded-xl border border-dashed p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <SparklesIcon className="size-4 shrink-0" aria-hidden="true" />
        This is a sample home
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {bottom
          ? "Nothing here is yours, and nothing you tap is saved. Your own home starts empty and fills up as you add things."
          : "Everything below came from four appliance manuals. Have a look around — then set up your own."}
      </p>
      <Button asChild size="sm" className="mt-3">
        <Link to="/">{bottom ? "Set up my home" : "Set up my home"}</Link>
      </Button>
    </div>
  )
}

function TaskRow({ task }: { task: SampleTask }) {
  const [open, setOpen] = useState(false)
  const tone = URGENCY[task.urgency]
  return (
    <li className="border-b last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 py-3.5 text-left min-h-[44px]"
      >
        <span
          className="mt-1.5 size-2 shrink-0 rounded-full"
          style={{ background: tone.dot }}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-foreground">{task.title}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm">
            <span className={tone.label}>{task.when}</span>
            <span className="text-muted-foreground">· {task.item}</span>
          </span>
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
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-[640px] px-5 py-6 pb-16">
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
