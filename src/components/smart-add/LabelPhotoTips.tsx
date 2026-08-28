import { LightbulbIcon } from "lucide-react"

/**
 * What to photograph, and what to do when the read comes back empty.
 *
 * The failure this exists to prevent is not a technical one. A first-time user
 * points the camera at the FRONT of the appliance, because that is what "take a
 * photo of your dishwasher" means in English, and gets nothing back — the model
 * number lives on a label inside the door frame. That is a capture problem
 * dressed up as an OCR problem, and no amount of pipeline work fixes it.
 *
 * The recovery advice used to be "try a straight-on shot in good light", which
 * is both unactionable (the user is in a dim utility room and cannot change
 * that) and, on the glossy foil labels most appliances use, actively wrong:
 * straight-on under a ceiling light or a flash is exactly how you get a glare
 * spot across the model number. Slightly off-axis is the fix.
 *
 * The words themselves went through a plain-language pass on 2026-08-27, after
 * the owner read the flow as tech speak. Three changes, each a small lie or a
 * small barrier: "rating label" is a trade term for a thing homeowners just
 * call a label; "the label should fill most of the frame" repeated a claim that
 * is not true and makes people step back, when only the model number has to be
 * legible; and "torch" is British, in an app whose users are in California.
 */

/**
 * The "before" variant retired on 2026-08-27. It was pre-capture guidance filed
 * BEHIND the capture control, inside a disclosure most people never opened —
 * so the advice that prevents the commonest failure was only reachable by
 * someone who had already gone looking. What mattered in it now lives where it
 * is read first: "Point at the model number" on the scan card, and "Usually on
 * a label inside the door or around the back" under the model field.
 *
 * The prop is gone rather than defaulted, so a caller that wants the old
 * behaviour fails to compile instead of quietly rendering retired copy.
 */
export function LabelPhotoTips({ variant }: { variant: "after-empty" }) {
  void variant
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
        <LightbulbIcon className="size-3.5 shrink-0" aria-hidden="true" />
        A few things that usually help
      </p>
      <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
        <li>
          <span className="font-medium text-foreground">Get closer</span> — the model number
          should be big and sharp. This fixes more failed reads than anything else.
        </li>
        <li>
          <span className="font-medium text-foreground">Tilt a little</span> instead of shooting
          straight on. Shiny labels bounce a ceiling light or a flash right back over the numbers.
        </li>
        <li>
          <span className="font-medium text-foreground">Wipe the label</span> — these sit in
          kitchens and utility rooms and pick up a film you stop noticing.
        </li>
        <li>
          <span className="font-medium text-foreground">Use your flashlight</span>, held off to
          one side rather than straight at the label.
        </li>
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">
        Or skip it — type the brand and model yourself. Everything works the same.
      </p>
    </div>
  )
}
