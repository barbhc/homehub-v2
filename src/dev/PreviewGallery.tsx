/**
 * /__preview — render one real component state by URL, dev builds only.
 *
 *   /__preview                    index of every scenario
 *   /__preview?s=<id>             one scenario, chrome-free (what shots capture)
 *
 * Excluded from production by the DEV guard at the route (App.tsx): the lazy
 * import never executes in a prod bundle, and the route renders nothing.
 */
import { useSearchParams, Link } from "react-router-dom"
import { SCENARIOS } from "./previewScenarios"

export default function PreviewGallery() {
  const [params] = useSearchParams()
  const id = params.get("s")
  const one = id ? SCENARIOS.find((sc) => sc.id === id) : null

  if (one) {
    return (
      <div data-preview-scenario={one.id} className="min-h-dvh bg-background">
        {one.render()}
      </div>
    )
  }
  if (id) return <p className="p-6 text-sm">No scenario named “{id}”.</p>

  return (
    <div className="mx-auto max-w-xl p-6">
      <h1 className="text-xl font-semibold">Design preview</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Real components, named states. `npm run shots` captures each at 375 / 390 / 430.
      </p>
      <ul className="mt-4 space-y-3">
        {SCENARIOS.map((sc) => (
          <li key={sc.id}>
            <Link to={`/__preview?s=${sc.id}`} className="font-medium text-primary underline underline-offset-2">
              {sc.id}
            </Link>
            <p className="text-xs text-muted-foreground">{sc.note}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
