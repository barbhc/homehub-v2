import useSWR from "swr"
import { resolveStorageUrl } from "@/integrations/firebase"
import type { DiagramImageUrl } from "@/integrations/types"

/** Resolved URLs are stable for a session — never revalidate. */
const SWR_OPTS = { revalidateOnFocus: false, revalidateIfStale: false, revalidateOnReconnect: false }

/**
 * Resolve a Storage object path (or legacy tokenless URL) to a token-bearing
 * download URL for use in <img>/<a>. Returns null until resolved.
 */
export function useStorageUrl(pathOrUrl: string | null | undefined): string | null {
  const { data } = useSWR(
    pathOrUrl ? ["storage-url", pathOrUrl] : null,
    ([, p]: [string, string]) => resolveStorageUrl(p),
    SWR_OPTS,
  )
  return data ?? null
}

/**
 * Resolve every diagram image's persisted URL. Entries written before the
 * public-read rules were closed hold tokenless URLs that a plain <img> can no
 * longer fetch; newer entries hold token URLs and pass through unchanged.
 * Returns the input list (URLs unresolved) until resolution completes.
 */
export function useResolvedDiagramImages(images: DiagramImageUrl[] | null | undefined): DiagramImageUrl[] {
  const list = images ?? []
  const { data } = useSWR(
    list.length > 0 ? ["diagram-urls", list.map((i) => i.url).join("\n")] : null,
    async () =>
      Promise.all(list.map(async (img) => ({ ...img, url: (await resolveStorageUrl(img.url)) ?? img.url }))),
    SWR_OPTS,
  )
  return data ?? list
}
