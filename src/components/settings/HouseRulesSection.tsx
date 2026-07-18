import { useCallback, useEffect, useState } from "react"
import { Loader2Icon, SlidersHorizontalIcon, Trash2 } from "lucide-react"
import { SectionCard } from "@/components/layout"
import { CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { listHouseRules, deleteHouseRule, type HouseRule } from "@/modules/care"

/**
 * Settings › House rules — the visible ledger of decisions the app learned from
 * task feedback. Every rule shows its plain-English provenance and is reversible;
 * deleting stops future application but never resurrects already-hidden tasks.
 */
export function HouseRulesSection({ homeId }: { homeId: string }) {
  const [rules, setRules] = useState<HouseRule[] | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await listHouseRules(homeId)
    if (res.error) { setError(res.error.message); setRules([]); return }
    setRules(res.data)
  }, [homeId])

  useEffect(() => { void load() }, [load])

  const handleDelete = async (id: string) => {
    setDeletingId(id); setError(null)
    const res = await deleteHouseRule(homeId, id)
    setDeletingId(null)
    if (res.error) { setError(res.error.message); return }
    setRules((prev) => (prev ? prev.filter((r) => r.id !== id) : prev))
  }

  return (
    <SectionCard id="house-rules" className="mt-6 scroll-mt-6">
      <CardContent className="p-4">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-foreground">
          <SlidersHorizontalIcon className="size-4" /> House rules
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Adjustments learned from your task feedback. Deleting a rule stops it applying to future tasks — it won't restore tasks you already hid.
        </p>

        {error && <p className="mb-3 text-sm" style={{ color: "var(--hh-clay)" }}>{error}</p>}

        {rules === null ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" /> Loading…
          </div>
        ) : rules.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No adjustments yet. When you tune a task from its detail page, the rule shows up here.
          </p>
        ) : (
          <div className="space-y-2">
            {rules.map((r) => (
              <div key={r.id} className="flex items-start justify-between gap-3 border-b border-border py-2 last:border-0">
                <div className="flex min-w-0 flex-col">
                  <span className="text-pretty text-sm text-foreground">{r.reason}</span>
                  {r.createdAt && (
                    <span className="mt-0.5 text-xs text-muted-foreground">Added {new Date(r.createdAt).toLocaleDateString()}</span>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  disabled={deletingId === r.id}
                  onClick={() => handleDelete(r.id)}
                  aria-label="Delete rule"
                >
                  {deletingId === r.id ? <Loader2Icon className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </SectionCard>
  )
}
