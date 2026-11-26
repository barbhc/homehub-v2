/**
 * The `?item=` parameter of /maintenance/custom (seventeen fixes, mock m4).
 *
 * URL input, so it is checked before it is used: it must look like a document
 * id as this app writes them (letters, digits, - and _; no slashes, so it can
 * never reach another path). The page then reads the item from THIS home
 * before trusting it. Anything else reads as no item.
 */
export function readItemParam(raw: string | null): string | null {
  return raw !== null && /^[A-Za-z0-9_-]{1,128}$/.test(raw) ? raw : null
}
