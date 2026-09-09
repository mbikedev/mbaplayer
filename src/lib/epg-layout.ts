import type { EpgEntry } from './xtream-types'

/**
 * Geometry for the EPG grid.
 *
 * The grid is a time axis: every programme is placed by its start and end, so
 * gaps in a portal's guide stay gaps instead of being closed up. All of it is
 * pure arithmetic on timestamps, kept out of the component so it can be tested
 * without a DOM.
 */

export const MINUTE_MS = 60_000
export const HOUR_MS = 60 * MINUTE_MS

export interface TimeWindow {
  start: number
  end: number
}

/**
 * Midnight-to-midnight in the viewer's own timezone, `dayOffset` days from the
 * day containing `now`.
 *
 * Local rather than UTC because the guide is read against a wall clock: a
 * programme at 20:00 belongs on the row for today, whatever the offset from
 * UTC. Using `setDate` past the end of a month rolls over correctly, and it
 * also handles days that are not 24 hours long across a DST change.
 */
export function dayWindow(dayOffset: number, now: number): TimeWindow {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() + dayOffset)

  const end = new Date(start)
  end.setDate(end.getDate() + 1)

  return { start: start.getTime(), end: end.getTime() }
}

/** Total pixel width of a window at the given scale. */
export function windowWidth(window: TimeWindow, pxPerMinute: number): number {
  return ((window.end - window.start) / MINUTE_MS) * pxPerMinute
}

/** Pixel offset of an instant from the window's left edge. */
export function offsetOf(instant: number, window: TimeWindow, pxPerMinute: number): number {
  return ((instant - window.start) / MINUTE_MS) * pxPerMinute
}

export interface ProgrammeRect {
  left: number
  width: number
  /** True when the programme starts before the window and has been cut. */
  clippedStart: boolean
  /** True when the programme runs past the window and has been cut. */
  clippedEnd: boolean
}

/**
 * Places a programme in the window, clipped to its edges.
 *
 * Returns null when the programme falls entirely outside — programmes that
 * merely touch a boundary (one ends exactly as the window starts) do not
 * overlap it and are excluded too, which keeps zero-width blocks out of the
 * grid. A programme spanning midnight is kept and clipped, so the last slot of
 * the evening still renders on the day the viewer is looking at.
 */
export function programmeRect(
  entry: Pick<EpgEntry, 'start' | 'stop'>,
  window: TimeWindow,
  pxPerMinute: number,
): ProgrammeRect | null {
  if (entry.stop <= window.start || entry.start >= window.end) return null

  const visibleStart = Math.max(entry.start, window.start)
  const visibleEnd = Math.min(entry.stop, window.end)

  return {
    left: offsetOf(visibleStart, window, pxPerMinute),
    width: ((visibleEnd - visibleStart) / MINUTE_MS) * pxPerMinute,
    clippedStart: entry.start < window.start,
    clippedEnd: entry.stop > window.end,
  }
}

/**
 * Tick marks for the time ruler, every `stepMinutes` from the window start.
 *
 * Stepping by a fixed number of minutes rather than by calendar hour means a
 * DST day produces 23 or 25 slots, matching the window's real length.
 */
export function rulerSlots(window: TimeWindow, stepMinutes: number): number[] {
  const step = stepMinutes * MINUTE_MS
  const slots: number[] = []
  for (let instant = window.start; instant < window.end; instant += step) {
    slots.push(instant)
  }
  return slots
}

/** Pixel offset of the now-marker, or null when now is outside the window. */
export function nowOffset(now: number, window: TimeWindow, pxPerMinute: number): number | null {
  if (now < window.start || now > window.end) return null
  return offsetOf(now, window, pxPerMinute)
}

/** The programme covering `instant`, if the channel has one. */
export function programmeAt(entries: EpgEntry[], instant: number): EpgEntry | null {
  return entries.find((entry) => entry.start <= instant && entry.stop > instant) ?? null
}

/**
 * Scroll position that puts `instant` a little in from the left edge, so the
 * programme at that time is fully visible rather than flush against the
 * channel column.
 */
export function scrollOffsetFor(
  instant: number,
  window: TimeWindow,
  pxPerMinute: number,
  leadMinutes = 30,
): number {
  const target = offsetOf(instant, window, pxPerMinute) - leadMinutes * pxPerMinute
  return Math.max(0, target)
}
