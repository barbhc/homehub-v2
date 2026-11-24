/**
 * A stand-in for @capacitor/push-notifications that a test can drive: it keeps
 * the listeners the app registers and lets the test answer register() the way
 * APNs would — with a token, with an error, or not at all.
 *
 *   const cap = vi.hoisted(() => ({ api: null as null | FakePush }))
 *   vi.mock("@capacitor/push-notifications", async () => {
 *     cap.api = (await import("@/test/fakeCapacitorPush")).createFakePush()
 *     return { PushNotifications: cap.api.PushNotifications }
 *   })
 */
import { vi } from "vitest"

type Listener = (payload: unknown) => void

export function createFakePush() {
  const listeners = new Map<string, Set<Listener>>()
  const emit = (event: string, payload: unknown) => {
    for (const fn of [...(listeners.get(event) ?? [])]) fn(payload)
  }
  /** What the next register() makes APNs do. */
  let onRegister: () => void = () => {}
  const permission = { receive: "prompt" as "prompt" | "granted" | "denied" }
  return {
    emit,
    permission,
    /** APNs answers every register() with this token. */
    apnsNames(token: string) {
      onRegister = () => queueMicrotask(() => emit("registration", { value: token }))
    },
    /** APNs refuses every register(). */
    apnsRefuses(error: string) {
      onRegister = () => queueMicrotask(() => emit("registrationError", { error }))
    },
    PushNotifications: {
      addListener: vi.fn(async (event: string, fn: Listener) => {
        if (!listeners.has(event)) listeners.set(event, new Set())
        listeners.get(event)!.add(fn)
        return { remove: vi.fn(async () => { listeners.get(event)!.delete(fn) }) }
      }),
      register: vi.fn(async () => { onRegister() }),
      unregister: vi.fn(async () => {}),
      checkPermissions: vi.fn(async () => ({ receive: permission.receive })),
      /** The system prompt, answered "Allow". */
      requestPermissions: vi.fn(async () => {
        permission.receive = "granted"
        return { receive: "granted" }
      }),
    },
  }
}

export type FakePush = ReturnType<typeof createFakePush>
