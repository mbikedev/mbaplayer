'use client'

import { useSyncExternalStore } from 'react'

const TICK_MS = 30_000

function subscribe(listener: () => void): () => void {
  const id = setInterval(listener, TICK_MS)
  return () => clearInterval(id)
}

/**
 * The current time, quantised to 30-second steps.
 *
 * Calling `Date.now()` during render is impure — two renders of the same state
 * can disagree — so the clock is modelled as an external store instead. The
 * quantisation keeps the snapshot stable between ticks (a changing snapshot on
 * every read would loop), and the ticking is what keeps the "now playing"
 * programme correct as an evening goes on.
 *
 * Returns 0 on the server and during hydration, which reads as "no programme
 * is current yet" and resolves on the first client render.
 */
export function useNow(): number {
  return useSyncExternalStore(
    subscribe,
    () => Math.floor(Date.now() / TICK_MS) * TICK_MS,
    () => 0,
  )
}
