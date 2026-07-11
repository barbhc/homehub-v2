/**
 * SWR-cached home_profile hook.
 *
 * Returns the profile row if present, null if the home hasn't answered the
 * Q&A yet, and an error if the lookup itself failed. Stays quiet on null —
 * callers should treat an absent profile as "use defaults," not an error.
 */
import useSWR from "swr"
import { getHomeProfile, type HomeProfile } from "../services/homeProfileService"

async function fetcher(homeId: string): Promise<HomeProfile | null> {
  const result = await getHomeProfile(homeId)
  if (result.error) throw new Error(result.error.message)
  return result.data
}

export function useHomeProfile(homeId: string | null) {
  const { data, error, isLoading, mutate } = useSWR(
    homeId ? `home_profile:${homeId}` : null,
    () => fetcher(homeId!),
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      dedupingInterval: 5000,
    },
  )

  return {
    profile: data ?? null,
    isLoading,
    error: error as Error | undefined,
    refresh: mutate,
  }
}
