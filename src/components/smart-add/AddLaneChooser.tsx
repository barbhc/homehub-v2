import { Armchair, Refrigerator } from "lucide-react"
import { track } from "@/lib/analytics"

export type AddLane = "appliance" | "simple"

/**
 * The add flow's lane chooser (docs/add-item-flow.md, Screen 1): "Appliance or
 * device" vs "Everything else". One component, two places: the add screen's
 * first state (IdentifyStep, "What are you adding?") and the empty Items tab
 * ("Add your first item"), where a pick opens the add screen in that lane.
 */
export function AddLaneChooser({
  heading = "What are you adding?",
  onPick,
}: {
  heading?: string
  onPick: (lane: AddLane) => void
}) {
  const pick = (lane: AddLane) => {
    track("add_lane_selected", { lane })
    onPick(lane)
  }
  return (
    <div className="flex flex-col gap-4 max-w-lg mx-auto" data-testid="add-lane-chooser">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{heading}</h2>
      </div>
      <button
        type="button"
        onClick={() => pick("appliance")}
        className="group text-left rounded-2xl border border-border bg-card p-5 shadow-sm hover:border-primary/50 hover:bg-primary/[0.02] transition-colors"
      >
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Refrigerator className="h-6 w-6" strokeWidth={1.5} aria-hidden />
          </div>
          <div>
            <p className="font-semibold text-foreground">Appliance or device</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Has a brand &amp; model — washer, fridge, thermostat, TV…
            </p>
            {/* The camera lives in THIS lane and nowhere else, so the person
                whose plan is "I'll photograph the label" needs to know that
                here, at the moment they choose. Said on the card it changes
                rather than in a caption underneath both of them. */}
            <p className="text-sm text-muted-foreground mt-0.5">
              Type it, or scan the label.
            </p>
          </div>
        </div>
      </button>
      <button
        type="button"
        onClick={() => pick("simple")}
        className="group text-left rounded-2xl border border-border bg-card p-5 shadow-sm hover:border-primary/50 hover:bg-primary/[0.02] transition-colors"
      >
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <Armchair className="h-6 w-6" strokeWidth={1.5} aria-hidden />
          </div>
          <div>
            <p className="font-semibold text-foreground">Everything else</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Faucet, toilet, sofa, deck, houseplant — just name it.
            </p>
          </div>
        </div>
      </button>
    </div>
  )
}
