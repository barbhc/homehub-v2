import { useCallback, useEffect, useState } from "react"
import { useCurrentPropertyCompat as useCurrentProperty } from "@/modules/home"
import * as service from "../services/inventoryService"
import type { Item, Category, Location } from "@/integrations/types"

export function useItems() {
  const { property } = useCurrentProperty()
  const [items, setItems] = useState<Item[]>([])
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
    const result = await service.getItems(property.id)
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
  const [item, setItem] = useState<Item | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!property || !id) return
    const result = await service.getItem(property.id, id)
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
    service.getItem(property.id, id).then((result) => {
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

export function useCategories() {
  const { property } = useCurrentProperty()
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!property) {
      setCategories([])
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    const result = await service.getCategories(property.id)
    if (result.error) {
      setError(result.error.message)
      setCategories([])
    } else {
      setCategories(result.data)
    }
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [property?.id])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { categories, loading, error, refresh }
}

export function useLocations() {
  const { property } = useCurrentProperty()
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!property) {
      setLocations([])
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    const result = await service.getLocations(property.id)
    if (result.error) {
      setError(result.error.message)
      setLocations([])
    } else {
      setLocations(result.data)
    }
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [property?.id])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { locations, loading, error, refresh }
}

export function useCreateItem() {
  const { property } = useCurrentProperty()
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createItem = useCallback(
    async (input: Omit<service.CreateItemInput, "property_id">) => {
      if (!property) {
        const err = { message: "No property selected" }
        setError(err.message)
        return { data: null, error: err }
      }
      setIsCreating(true)
      setError(null)
      const result = await service.createItem({
        ...input,
        property_id: property.id,
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
