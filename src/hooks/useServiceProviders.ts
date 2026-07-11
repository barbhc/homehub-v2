import { useCallback, useEffect, useState } from "react"
import { supabase } from "@/integrations/shim/client"
import type { ServiceProvider } from "@/integrations/types"

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
      const { data } = await supabase
        .from("service_provider")
        .select("*")
        .eq("home_id", homeId)
        .is("deleted_at", null)
        .order("category", { ascending: true })
        .order("name", { ascending: true })
      if (signal?.cancelled) return
      setProviders((data ?? []) as ServiceProvider[])
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

      const payload = {
        home_id: homeId,
        name,
        category: form.category,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        website: form.website.trim() || null,
        notes: form.notes.trim() || null,
        updated_at: new Date().toISOString(),
      }

      if (editingId) {
        const { error } = await supabase
          .from("service_provider")
          .update(payload)
          .eq("provider_id", editingId)
          .eq("home_id", homeId)
        if (error) return { error: error.message }
        let saved: ServiceProvider | undefined
        setProviders((prev) =>
          sortProviders(
            prev.map((p) => {
              if (p.provider_id !== editingId) return p
              saved = { ...p, ...payload }
              return saved
            })
          )
        )
        return { provider: saved }
      }

      const { data, error } = await supabase
        .from("service_provider")
        .insert(payload)
        .select()
        .single()
      if (error || !data) return { error: error?.message ?? "Could not save provider" }
      const saved = data as ServiceProvider
      setProviders((prev) => sortProviders([...prev, saved]))
      return { provider: saved }
    },
    [homeId]
  )

  const remove = useCallback(
    async (providerId: string) => {
      setDeletingId(providerId)
      await supabase
        .from("service_provider")
        .update({ deleted_at: new Date().toISOString() })
        .eq("provider_id", providerId)
        .eq("home_id", homeId)
      setProviders((prev) => prev.filter((p) => p.provider_id !== providerId))
      setDeletingId(null)
    },
    [homeId]
  )

  return { providers, loading, deletingId, save, remove }
}
