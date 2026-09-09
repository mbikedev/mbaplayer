'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from '@/context/session'
import { useEpgBatch } from '@/hooks/use-epg-batch'
import { formatTime } from '@/lib/format'
import {
  nowOffset,
  programmeRect,
  rulerSlots,
  scrollOffsetFor,
  windowWidth,
  type TimeWindow,
} from '@/lib/epg-layout'
import type { EpgEntry, LiveChannel } from '@/lib/xtream-types'
import { Spinner, cx } from './ui'

export interface EpgSelection {
  channel: LiveChannel
  entry: EpgEntry
}

interface EpgGridProps {
  channels: LiveChannel[]
  window: TimeWindow
  /** Horizontal scale. 4 px per minute puts about four hours on a laptop. */
  pxPerMinute: number
  now: number
  onSelect: (selection: EpgSelection) => void
  selectedEntryId: string | null
}

const ROW_HEIGHT = 64
const HEADER_HEIGHT = 40

/**
 * Width of the frozen channel column, defined as `--epg-col` in globals.css so
 * it can narrow on small screens. It is needed in three places — the column
 * itself, the offset the programme labels stick to, and the now-marker — which
 * is why it is a custom property rather than a number here.
 */
const CHANNEL_COLUMN = 'var(--epg-col)'
const RULER_STEP_MINUTES = 30

/** Extra rows rendered above and below the viewport, to cover fast scrolling. */
const OVERSCAN_ROWS = 4

/** Rows assumed visible before the container has been measured. */
const INITIAL_VISIBLE_ROWS = 12

/** Delay before the scrolled-to rows are handed to the EPG loader. */
const FETCH_DEBOUNCE_MS = 200

export function EpgGrid({
  channels,
  window: timeWindow,
  pxPerMinute,
  now,
  onSelect,
  selectedEntryId,
}: EpgGridProps) {
  const { credentials } = useSession()
  const scrollRef = useRef<HTMLDivElement>(null)
  const fetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const didInitialScroll = useRef(false)

  // Rendered range and fetched range are tracked separately: the first has to
  // keep up with the scroll, the second is debounced so flinging through a
  // thousand channels does not queue a thousand requests.
  const [range, setRange] = useState({ start: 0, end: INITIAL_VISIBLE_ROWS })
  const [fetchRange, setFetchRange] = useState({ start: 0, end: INITIAL_VISIBLE_ROWS })

  const gridWidth = windowWidth(timeWindow, pxPerMinute)
  const slots = rulerSlots(timeWindow, RULER_STEP_MINUTES)
  const marker = nowOffset(now, timeWindow, pxPerMinute)

  const visibleStart = Math.max(0, range.start)
  const visibleEnd = Math.min(channels.length, range.end)
  const visibleChannels = channels.slice(visibleStart, visibleEnd)

  const epg = useEpgBatch(
    credentials,
    channels.slice(Math.max(0, fetchRange.start), Math.min(channels.length, fetchRange.end)).map((c) => c.id),
  )

  const measure = useCallback(() => {
    const node = scrollRef.current
    if (!node) return

    const first = Math.floor(node.scrollTop / ROW_HEIGHT) - OVERSCAN_ROWS
    const last = Math.ceil((node.scrollTop + node.clientHeight) / ROW_HEIGHT) + OVERSCAN_ROWS
    const next = { start: Math.max(0, first), end: last }

    setRange((current) =>
      current.start === next.start && current.end === next.end ? current : next,
    )

    if (fetchTimer.current) clearTimeout(fetchTimer.current)
    fetchTimer.current = setTimeout(() => setFetchRange(next), FETCH_DEBOUNCE_MS)
  }, [])

  // The container's height is not known until it is laid out, and it changes
  // when the window is resized or the browser chrome collapses on a phone.
  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => {
      observer.disconnect()
      if (fetchTimer.current) clearTimeout(fetchTimer.current)
    }
  }, [measure])

  // Open on the current time rather than at midnight, once per day window.
  useEffect(() => {
    didInitialScroll.current = false
  }, [timeWindow.start])

  useEffect(() => {
    const node = scrollRef.current
    if (!node || didInitialScroll.current || marker === null) return
    didInitialScroll.current = true
    node.scrollLeft = scrollOffsetFor(now, timeWindow, pxPerMinute)
  }, [marker, now, timeWindow, pxPerMinute])

  const jumpToNow = () => {
    const node = scrollRef.current
    if (!node || marker === null) return
    node.scrollTo({ left: scrollOffsetFor(now, timeWindow, pxPerMinute), behavior: 'smooth' })
  }

  return (
    <div className="space-y-2">
      {marker !== null ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={jumpToNow}
            className="rounded-lg border border-ink-700 bg-ink-900 px-3 py-1.5 text-sm text-ink-300 transition-colors hover:border-gold-500/40 hover:text-gold-300"
          >
            Aller à maintenant
          </button>
        </div>
      ) : null}

      <div
        ref={scrollRef}
        onScroll={measure}
        className="epg-grid relative max-h-[70dvh] overflow-auto rounded-card border border-ink-800 bg-ink-900"
      >
        <div className="relative" style={{ width: `calc(${CHANNEL_COLUMN} + ${gridWidth}px)` }}>
          {/* Time ruler */}
          <div
            className="sticky top-0 z-30 flex bg-ink-850"
            style={{ height: HEADER_HEIGHT }}
          >
            <div
              className="sticky left-0 z-40 flex shrink-0 items-center border-b border-r border-ink-700 bg-ink-850 px-3 text-xs font-semibold uppercase tracking-wide text-ink-400"
              style={{ width: CHANNEL_COLUMN }}
            >
              Chaîne
            </div>
            <div className="relative shrink-0 border-b border-ink-700" style={{ width: gridWidth }}>
              {slots.map((instant) => {
                const isHour = new Date(instant).getMinutes() === 0
                return (
                  <div
                    key={instant}
                    className={cx(
                      'absolute top-0 flex h-full items-center border-l pl-1.5 text-xs',
                      isHour ? 'border-ink-600 font-medium text-ink-200' : 'border-ink-800 text-ink-500',
                    )}
                    style={{
                      left: ((instant - timeWindow.start) / 60_000) * pxPerMinute,
                    }}
                  >
                    {formatTime(instant)}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Spacer for the rows scrolled off the top */}
          <div style={{ height: visibleStart * ROW_HEIGHT }} />

          {visibleChannels.map((channel) => (
            <ChannelRow
              key={channel.id}
              channel={channel}
              entries={epg.byChannel.get(channel.id)}
              loading={epg.pending.has(channel.id)}
              window={timeWindow}
              pxPerMinute={pxPerMinute}
              gridWidth={gridWidth}
              now={now}
              onSelect={onSelect}
              selectedEntryId={selectedEntryId}
            />
          ))}

          {/* Spacer for the rows below the viewport */}
          <div style={{ height: Math.max(0, channels.length - visibleEnd) * ROW_HEIGHT }} />

          {/* Now marker, drawn over every row but under the sticky chrome */}
          {marker !== null ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute z-20 w-px bg-gold-500"
              style={{
                left: `calc(${CHANNEL_COLUMN} + ${marker}px)`,
                top: HEADER_HEIGHT,
                height: channels.length * ROW_HEIGHT,
              }}
            >
              <span className="absolute -left-1 -top-1 size-2 rounded-full bg-gold-500" />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function ChannelRow({
  channel,
  entries,
  loading,
  window: timeWindow,
  pxPerMinute,
  gridWidth,
  now,
  onSelect,
  selectedEntryId,
}: {
  channel: LiveChannel
  entries: EpgEntry[] | undefined
  loading: boolean
  window: TimeWindow
  pxPerMinute: number
  gridWidth: number
  now: number
  onSelect: (selection: EpgSelection) => void
  selectedEntryId: string | null
}) {
  const placed = (entries ?? [])
    .map((entry) => ({ entry, rect: programmeRect(entry, timeWindow, pxPerMinute) }))
    .filter((item): item is { entry: EpgEntry; rect: NonNullable<typeof item.rect> } =>
      item.rect !== null,
    )

  return (
    <div className="flex border-b border-ink-800" style={{ height: ROW_HEIGHT }}>
      <div
        className="sticky left-0 z-10 flex shrink-0 items-center gap-2.5 border-r border-ink-700 bg-ink-900 px-3"
        style={{ width: CHANNEL_COLUMN }}
      >
        <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-ink-850 text-[10px] text-ink-400">
          {channel.icon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={channel.icon}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={(event) => {
                event.currentTarget.style.display = 'none'
              }}
              className="size-full object-contain"
            />
          ) : (
            channel.num
          )}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-ink-100">{channel.name}</span>
      </div>

      <div className="relative shrink-0" style={{ width: gridWidth }}>
        {placed.map(({ entry, rect }) => {
          const isNow = entry.start <= now && entry.stop > now
          const isSelected = entry.id === selectedEntryId
          return (
            <button
              key={`${entry.id}-${entry.start}`}
              type="button"
              onClick={() => onSelect({ channel, entry })}
              title={`${entry.title} · ${formatTime(entry.start)} – ${formatTime(entry.stop)}`}
              className={cx(
                'absolute inset-y-1 rounded-md border text-left transition-colors',
                isSelected
                  ? 'border-gold-500 bg-gold-500/20'
                  : isNow
                    ? 'border-gold-500/40 bg-gold-500/10 hover:bg-gold-500/15'
                    : 'border-ink-700 bg-ink-850 hover:border-ink-600 hover:bg-ink-800',
              )}
              style={{ left: rect.left, width: Math.max(rect.width - 2, 2) }}
            >
              {/*
                The label sticks to the visible left edge instead of the block's
                own edge. A programme that started before the current scroll
                position — which is exactly the one playing now — would otherwise
                render as an empty rectangle with its title off screen. It sticks
                past the frozen channel column so it is not hidden underneath it.

                `w-max` matters: a sticky box is constrained to its containing
                block, so a label stretched to the block's full width has nowhere
                to slide and never moves. Sizing it to its content leaves the
                remaining width as travel, and `max-w-full` keeps it inside a
                short programme. The block cannot use overflow-hidden either —
                that would make it a scroll container and cancel the stickiness —
                so the label clips its own text instead.
              */}
              <span
                className="sticky block w-max max-w-full px-2 py-1"
                style={{ left: `calc(${CHANNEL_COLUMN} + 4px)` }}
              >
                <span
                  className={cx(
                    'block truncate text-xs font-medium',
                    isNow || isSelected ? 'text-gold-200' : 'text-ink-100',
                  )}
                >
                  {entry.title || 'Sans titre'}
                </span>
                <span className="block truncate text-[11px] text-ink-400">
                  {rect.clippedStart ? '… ' : ''}
                  {formatTime(entry.start)}
                  {rect.clippedEnd ? ' …' : ''}
                </span>
              </span>
            </button>
          )
        })}

        {loading ? (
          <span className="absolute left-3 top-1/2 flex -translate-y-1/2 items-center gap-2 text-xs text-ink-500">
            <Spinner className="size-3.5" />
            Chargement du guide…
          </span>
        ) : entries && entries.length === 0 ? (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-ink-600">
            Pas de guide pour cette chaîne
          </span>
        ) : null}
      </div>
    </div>
  )
}
