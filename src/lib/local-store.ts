'use client'

import { useSyncExternalStore } from 'react'

/**
 * A tiny external store over `localStorage`.
 *
 * Reading localStorage inside an effect and calling `setState` is the classic
 * way to do this, but it renders once with the wrong value and trips React's
 * "no setState in an effect" rule. `useSyncExternalStore` is the supported
 * mechanism: it renders the server snapshot during hydration and switches to
 * the real value in the same commit, with no cascading render.
 *
 * `useSyncExternalStore` compares snapshots by identity, so every reader must
 * return the *same object* until something actually changes. That is what the
 * version-stamped cache below is for — `listFavorites()` builds a new array on
 * every call and would otherwise loop forever.
 */

type Listener = () => void

const listeners = new Set<Listener>()
const snapshots = new Map<string, { version: number; value: unknown }>()

let version = 0

function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  // Another tab writing to localStorage fires `storage`; same-tab writes go
  // through `notifyLocalChange` instead, since `storage` does not self-fire.
  const onStorage = () => {
    version += 1
    listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

/** Invalidates every cached snapshot and re-renders subscribers. */
export function notifyLocalChange(): void {
  version += 1
  snapshots.clear()
  for (const listener of listeners) listener()
}

/**
 * Reads a value derived from localStorage, cached by `key` until the next
 * `notifyLocalChange()`.
 *
 * `serverValue` must be a stable constant — it is returned during SSR and the
 * hydration pass, so a fresh `[]` literal would break snapshot identity.
 */
export function useLocalValue<T>(key: string, read: () => T, serverValue: T): T {
  return useSyncExternalStore(
    subscribe,
    () => {
      const hit = snapshots.get(key)
      if (hit && hit.version === version) return hit.value as T
      const value = read()
      snapshots.set(key, { version, value })
      return value
    },
    () => serverValue,
  )
}

/** Stable empty array for `serverValue`, so identity never changes. */
export const EMPTY_ARRAY: never[] = []

/**
 * True once the client has taken over from the server-rendered markup.
 *
 * Screens guarded by a stored profile need this: during hydration every
 * localStorage-backed reader still returns its server snapshot, and redirecting
 * on that would bounce a signed-in user back to the login page.
 */
export function useIsHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  )
}
