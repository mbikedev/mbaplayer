'use client'

import { useEffect, useRef, useState } from 'react'
import { getChannelEpg, type Credentials } from '@/lib/xtream'
import type { EpgEntry } from '@/lib/xtream-types'

/**
 * Loads the EPG for a set of channels, a few at a time.
 *
 * The guide asks only for the rows currently on screen. Fetching the whole
 * catalogue would be thousands of requests, and the one-shot alternative
 * (`xmltv.php`) is a single file of tens of megabytes.
 *
 * Results are cached for the tab's lifetime, so scrolling back up is instant
 * and a channel is never requested twice.
 */

/** Portals are modest hosts; a wide fan-out gets requests dropped or throttled. */
const CONCURRENCY = 4

/** Coalesces the per-channel arrivals into a few renders instead of one each. */
const FLUSH_DELAY_MS = 120

/**
 * Cap on cached channels. Scrolling a 10 000-channel list would otherwise hold
 * every guide in memory; the oldest half is dropped and simply refetched if the
 * viewer scrolls back that far.
 */
const CACHE_LIMIT = 400

export interface EpgBatch {
  /** Channel id to its programmes. A missing key means "not loaded yet". */
  byChannel: ReadonlyMap<string, EpgEntry[]>
  /** Channels with a request in flight, for per-row loading states. */
  pending: ReadonlySet<string>
}

const EMPTY_BATCH: EpgBatch = { byChannel: new Map(), pending: new Set() }

export function useEpgBatch(
  credentials: Credentials | null,
  channelIds: readonly string[],
): EpgBatch {
  const [batch, setBatch] = useState<EpgBatch>(EMPTY_BATCH)

  // The cache and the in-flight set outlive individual effect runs, so they sit
  // in a ref rather than in state — they are bookkeeping, not rendered data.
  const store = useRef({
    cache: new Map<string, EpgEntry[]>(),
    inFlight: new Set<string>(),
  })

  // A stable dependency: the array identity changes on every render, its
  // contents do not.
  const requestKey = channelIds.join(',')

  useEffect(() => {
    if (!credentials) return

    const { cache, inFlight } = store.current
    const todo = channelIds.filter((id) => !cache.has(id) && !inFlight.has(id))
    if (todo.length === 0) return

    let cancelled = false
    let flushTimer: ReturnType<typeof setTimeout> | null = null

    const publish = () => {
      flushTimer = null
      if (cancelled) return
      setBatch({ byChannel: new Map(cache), pending: new Set(inFlight) })
    }

    const scheduleFlush = () => {
      if (flushTimer !== null || cancelled) return
      flushTimer = setTimeout(publish, FLUSH_DELAY_MS)
    }

    for (const id of todo) inFlight.add(id)
    scheduleFlush()

    let cursor = 0
    const worker = async () => {
      while (cursor < todo.length) {
        const id = todo[cursor++]
        // getChannelEpg resolves to [] rather than rejecting, so one channel
        // without a guide cannot stall the rest of the batch.
        const entries = await getChannelEpg(credentials, id)
        inFlight.delete(id)
        cache.set(id, entries)

        if (cache.size > CACHE_LIMIT) {
          // Map iterates in insertion order, so this drops the least recently
          // fetched half.
          for (const key of [...cache.keys()].slice(0, Math.floor(CACHE_LIMIT / 2))) {
            cache.delete(key)
          }
        }

        scheduleFlush()
      }
    }

    void Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, worker))

    return () => {
      cancelled = true
      if (flushTimer !== null) clearTimeout(flushTimer)
      // In-flight requests are left to finish and populate the cache: the
      // viewer has probably just scrolled past, and may scroll back.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [credentials, requestKey])

  return batch
}
