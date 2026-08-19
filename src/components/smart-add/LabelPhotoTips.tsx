import { LightbulbIcon } from "lucide-react"

/**
 * What to photograph, and what to do when the read comes back empty.
 *
 * The failure this exists to prevent is not a technical one. A first-time user
 * points the camera at the FRONT of the appliance, because that is what "take a
 * photo of your dishwasher" means in English, and gets nothing back — the model
 * number lives on a sticker inside the door frame. That is a capture problem
 * dressed up as an OCR problem, and no amount of pipeline work fixes it.
 *
 * The recovery advice used to be "try a straight-on shot in good light", which
 * is both unactionable (the user is in a dim utility room and cannot change
 * that) and, on the glossy foil labels most appliances use, actively wrong:
 * straight-on under a ceiling light or a flash is exactly how you get a
 * specular highlight across the model number. Slightly off-axis is the fix.
 */

export function LabelPhotoTips({ variant }: { variant: "before" | "after-empty" }) {
  if (variant === "before") {
    return (
      <p className="text-xs text-muted-foreground">
        Photograph the <span className="font-medium text-foreground">rating label</span> — the
        sticker with the model number, not the front of the appliance. It is usually inside the
        door frame, around the back, or under the lid.
      </p>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
        <LightbulbIcon className="size-3.5 shrink-0" aria-hidden="true" />
        Worth trying, in this order
      </p>
      <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
        <li>
          <span className="font-medium text-foreground">Get closer</span> — the label should fill
          most of the frame. This fixes more failed reads than anything else.
        </li>
        <li>
          <span className="font-medium text-foreground">Tilt slightly</span> rather than shooting
          square on. Glossy labels bounce a ceiling light or a flash straight back over the model
          number.
        </li>
        <li>
          <span className="font-medium text-foreground">Wipe it</span> — these stickers sit in
          kitchens and utility rooms and collect a film you stop noticing.
        </li>
        <li>
          <span className="font-medium text-foreground">Use the torch</span>, held off to one
          side rather than straight at the label.
        </li>
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">
        Or skip it — type the brand and model in yourself and everything works exactly the same.
      </p>
    </div>
  )
}
