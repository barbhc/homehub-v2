/**
 * Settings → Homes: which home these settings are for, and the one place to
 * add another (owner, 2026-11-19: the name under Home's greeting shows only
 * once there is a choice to make). Moved from the one-page Settings unchanged.
 */
import { useState } from "react"
import { PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { HomeSwitcherSheet } from "@/components/home/HomeSwitcherSheet"
import { useAuth } from "@/modules/auth"
import { useCurrentHome } from "@/modules/home"

export function HomesPane() {
  const { user } = useAuth()
  const { home, homes, setCurrentHome, refresh: refreshHomes } = useCurrentHome()
  const [homesSheet, setHomesSheet] = useState<"list" | "add" | null>(null)
  if (!home || !user) return null
  return (
    <section
      className="rounded-2xl p-4 shadow-[0_1px_2px_rgba(15,23,42,0.05)]"
      style={{ background: "var(--hh-surface)" }}
    >
      <p className="text-[0.8125rem] leading-[1.38]" style={{ color: "var(--hh-sub)" }}>
        {homes.length > 1
          ? `These settings are for ${home.name}.`
          : "Each home keeps its own items, tasks and rooms."}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {homes.length > 1 && (
          <Button variant="outline" size="sm" className="hit-44" onClick={() => setHomesSheet("list")}>
            Switch home
          </Button>
        )}
        <Button variant="outline" size="sm" className="hit-44" onClick={() => setHomesSheet("add")}>
          <PlusIcon className="size-4" aria-hidden />
          Add a home
        </Button>
      </div>
      <HomeSwitcherSheet
        open={homesSheet !== null}
        onOpenChange={(open) => { if (!open) setHomesSheet(null) }}
        startWith={homesSheet ?? "list"}
        homes={homes}
        currentHomeId={home.home_id}
        userId={user.id}
        onSelect={setCurrentHome}
        onCreated={(newHomeId) => refreshHomes(newHomeId)}
      />
    </section>
  )
}
