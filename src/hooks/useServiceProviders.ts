import { useCallback, useEffect, useState } from "react"
import { collection, doc, getDoc, getDocs, query, serverTimestamp, where, writeBatch, Timestamp, type DocumentData } from "firebase/firestore"
import { db } from "@/integrations/firebase"
import type { ServiceProvider } from "@/integrations/types"

function providerIso(v: unknown): string {
  if (v instanceof Timestamp) return v.toDate().toISOString()
  return typeof v === "string" ? v : ""
}
function toProvider(homeId: string, id: string, d: DocumentData): ServiceProvider {
  return {
    provider_id: id,
    home_id: homeId,
    name: d.name ?? "",
    category: d.category ?? "other",
    phone: d.phone ?? null,
    email: d.email ?? null,
    website: d.website ?? null,
    notes: d.notes ?? null,
    created_at: providerIso(d.createdAt),
    updated_at: providerIso(d.updatedAt),
    deleted_at: d.deletedAt == null ? null : providerIso(d.deletedAt),
  }
}

// ── Category config (shared by Settings + the Providers page) ──────────────────

export const PROVIDER_CATEGORIES = [
  { value: "hvac", label: "HVAC" },
  { value: "plumber", label: "Plumber" },
  { value: "electrician", label: "Electrician" },
  { value: "general_contractor", label: "General Contractor" },
  { value: "landscaper", label: "Landscaper" },
  { value: "pest_control", label: "Pest Control" },
  { value: "roofer", label: "Roofer" },
  { value: "painter", label: "Painter" },
  { value: "appliance_repair", label: "Appliance Repair" },
  { value: "handyman", label: "Handyman" },
  { value: "cleaner", label: "Cleaner" },
  { value: "other", label: "Other" },
] as const

export function categoryLabel(value: string): string {
  return PROVIDER_CATEGORIES.find((c) => c.value === value)?.label ?? value
}

/** Two-letter initials from a provider name, for avatar glyphs. */
export function providerInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

// ── Form shape shared by add/edit flows ────────────────────────────────────────

export type ProviderFormState = {
  name: string
  category: string
  phone: string
  email: string
  website: string
  notes: string
}

export const EMPTY_PROVIDER_FORM: ProviderFormState = {
  name: "",
  category: "hvac",
  phone: "",
  email: "",
  website: "",
  notes: "",
}

function sortProviders(list: ServiceProvider[]): ServiceProvider[] {
  return [...list].sort(
    (a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)
  )
}

/**
 * Owns the `service_provider` load + create / edit / delete (soft) logic so the
 * Settings section and the standalone Providers page stay consistent. Mutations
 * update local state optimistically after the network round-trip succeeds.
 */
export function useServiceProviders(homeId: string) {
  const [providers, setProviders] = useState<ServiceProvider[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = useCallback(async (signal?: { cancelled: boolean }) => {
    setLoading(true)
    try {
      const snap = await getDocs(query(collection(db, `homes/${homeId}/serviceProviders`), where("deletedAt", "==", null)))
      if (signal?.cancelled) return
      setProviders(sortProviders(snap.docs.map((d) => toProvider(homeId, d.id, d.data()))))
    } finally {
      if (!signal?.cancelled) setLoading(false)
    }
  }, [homeId])

  useEffect(() => {
    const signal = { cancelled: false }
    load(signal)
    return () => { signal.cancelled = true }
  }, [load])

  /** Insert or update. Returns the saved row on success, or an error message. */
  const save = useCallback(
    async (
      form: ProviderFormState,
      editingId: string | null
    ): Promise<{ provider?: ServiceProvider; error?: string }> => {
      const name = form.name.trim()
      if (!name) return { error: "Name is required." }

      const fields = {
        name,
        category: form.category,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        website: form.website.trim() || null,
        notes: form.notes.trim() || null,
        updatedAt: serverTimestamp(),
      }

      try {
        if (editingId) {
          const ref = doc(db, `homes/${homeId}/serviceProviders/${editingId}`)
          await writeBatch(db).set(ref, fields, { merge: true }).commit()
          const snap = await getDoc(ref)
          const saved = toProvider(homeId, ref.id, snap.data() ?? {})
          setProviders((prev) => sortProviders(prev.map((p) => (p.provider_id === editingId ? saved : p))))
          return { provider: saved }
        }
        const ref = doc(collection(db, `homes/${homeId}/serviceProviders`))
        await writeBatch(db).set(ref, { ...fields, createdAt: serverTimestamp(), deletedAt: null }).commit()
        const snap = await getDoc(ref)
        const saved = toProvider(homeId, ref.id, snap.data() ?? {})
        setProviders((prev) => sortProviders([...prev, saved]))
        return { provider: saved }
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Could not save provider" }
      }
    },
    [homeId]
  )

  const remove = useCallback(
    async (providerId: string) => {
      setDeletingId(providerId)
      const now = serverTimestamp()
      await writeBatch(db)
        .set(doc(db, `homes/${homeId}/serviceProviders/${providerId}`), { deletedAt: now, updatedAt: now }, { merge: true })
        .commit()
      setProviders((prev) => prev.filter((p) => p.provider_id !== providerId))
      setDeletingId(null)
    },
    [homeId]
  )

  return { providers, loading, deletingId, save, remove }
}
