/**
 * How long a page's first read may take before it is reported as failed.
 *
 * SWR has no timeout of its own, and a Firestore read that never answers (a
 * WebView resumed with a dead socket, a captive portal) never settles — so
 * without this a hung request is an endless skeleton with nothing to press.
 */
export const LOAD_TIMEOUT_MS = 20_000

/**
 * Reject with `message` after `ms`, so a hung read surfaces the page's error
 * state (and its retry) instead of trapping the user on a loading skeleton.
 *
 * The timer is cleared as soon as the race settles: a fast answer leaves
 * nothing pending behind it.
 */
export function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms)
  })
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer))
}
