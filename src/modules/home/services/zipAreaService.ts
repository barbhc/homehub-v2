/**
 * The zip table, loaded only when someone types a zip (D8). It ships with the
 * app as its own chunk, so the zip is looked up on the device and never sent
 * anywhere (must-be-true 2): there is no network request that carries it.
 */
import { lookupZip, type ZipArea, type ZipAreaTable } from "../../../../shared/area/zipArea"

let table: Promise<ZipAreaTable> | null = null

/** The table, fetched once per session. A failed load is not cached, so Try again really tries again. */
export function loadZipTable(): Promise<ZipAreaTable> {
  if (!table) {
    table = import("@/data/zip-area.json")
      .then((m) => (m.default ?? m) as unknown as ZipAreaTable)
      .catch((e: unknown) => {
        table = null
        throw e instanceof Error ? e : new Error(String(e))
      })
  }
  return table
}

export type ZipLookup =
  | { kind: "found"; area: ZipArea }
  /** Five digits the table does not know (a new or non-US zip). */
  | { kind: "unknown" }
  /** Not five digits. */
  | { kind: "invalid" }

/** Throws only when the table itself could not load (offline at step 1). */
export async function lookupZipArea(input: string): Promise<ZipLookup> {
  if (!/^\s*\d{5}\s*$/.test(input)) return { kind: "invalid" }
  const area = lookupZip(await loadZipTable(), input)
  return area ? { kind: "found", area } : { kind: "unknown" }
}
