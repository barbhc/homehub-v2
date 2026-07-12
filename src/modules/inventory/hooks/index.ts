import { useCallback, useEffect, useState } from "react"
import { useCurrentPropertyCompat as useCurrentProperty } from "@/modules/home"
import {
  createItemUnit,
  getItemUnit,
  getItemUnits,
  type CreateItemUnitInput,
} from "@/modules/items"
import type { ItemUnit } from "@/integrations/types"

/**
 * Inventory hooks — thin wrappers over the Firebase-native itemService
 * (homes/{homeId}/items). The Lovable-era items/categories/locations service
 * they used to wrap is gone; consumers now receive the curated ItemUnit shape.
 */

export function useItems() {
  const { property } = useCurrentProperty()
  const [items, setItems] = useState<ItemUnit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!property) {
      setItems([])
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    const result = await getItemUnits(property.id)
    if (result.error) {
      setError(result.error.message)
      setItems([])
    } else {
      setItems(result.data)
    }
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [property?.id])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { items, loading, error, refresh }
}

export function useItem(id: string | undefined) {
  const { property } = useCurrentProperty()
  const [item, setItem] = useState<ItemUnit | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!property || !id) return
    const result = await getItemUnit(property.id, id)
    if (result.error) {
      setError(result.error.message)
      setItem(null)
    } else {
      setItem(result.data)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [property?.id, id])

  useEffect(() => {
    if (!property || !id) {
      setItem(null)
      setLoading(false)
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    getItemUnit(property.id, id).then((result) => {
      if (cancelled) return
      if (result.error) {
        setError(result.error.message)
        setItem(null)
      } else {
        setItem(result.data)
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [property?.id, id])

  return { item, loading, error, refresh }
}

export function useCreateItem() {
  const { property } = useCurrentProperty()
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createItem = useCallback(
    async (input: Omit<CreateItemUnitInput, "home_id">) => {
      if (!property) {
        const err = { message: "No property selected" }
        setError(err.message)
        return { data: null, error: err }
      }
      setIsCreating(true)
      setError(null)
      const result = await createItemUnit({
        ...input,
        home_id: property.id,
      })
      if (result.error) setError(result.error.message)
      setIsCreating(false)
      return result
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [property?.id]
  )

  return { createItem, isCreating, error }
}
