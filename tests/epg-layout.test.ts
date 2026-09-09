import { describe, expect, it } from 'vitest'
import {
  HOUR_MS,
  MINUTE_MS,
  dayWindow,
  nowOffset,
  offsetOf,
  programmeAt,
  programmeRect,
  rulerSlots,
  scrollOffsetFor,
  windowWidth,
} from '@/lib/epg-layout'

/** 2026-09-09 14:30 local time, used as "now" throughout. */
const NOW = new Date(2026, 8, 9, 14, 30).getTime()
const TODAY = dayWindow(0, NOW)

function at(hour: number, minute = 0, dayOffset = 0): number {
  return new Date(2026, 8, 9 + dayOffset, hour, minute).getTime()
}

describe('dayWindow', () => {
  it('spans local midnight to midnight', () => {
    expect(new Date(TODAY.start).getHours()).toBe(0)
    expect(new Date(TODAY.start).getMinutes()).toBe(0)
    expect(new Date(TODAY.end).getHours()).toBe(0)
    expect(TODAY.end - TODAY.start).toBe(24 * HOUR_MS)
  })

  it('moves whole days for an offset, including across a month boundary', () => {
    expect(dayWindow(1, NOW).start).toBe(TODAY.end)
    expect(dayWindow(-1, NOW).end).toBe(TODAY.start)

    const endOfMonth = new Date(2026, 8, 30, 22, 0).getTime()
    expect(new Date(dayWindow(1, endOfMonth).start).getMonth()).toBe(9) // October
    expect(new Date(dayWindow(1, endOfMonth).start).getDate()).toBe(1)
  })

  it('is stable regardless of the time of day it is called with', () => {
    expect(dayWindow(0, at(0, 1))).toEqual(dayWindow(0, at(23, 59)))
  })
})

describe('windowWidth and offsetOf', () => {
  it('scales the window by pixels per minute', () => {
    expect(windowWidth(TODAY, 4)).toBe(24 * 60 * 4)
    expect(windowWidth(TODAY, 2)).toBe(24 * 60 * 2)
  })

  it('measures an instant from the window start', () => {
    expect(offsetOf(at(1, 0), TODAY, 4)).toBe(60 * 4)
    expect(offsetOf(TODAY.start, TODAY, 4)).toBe(0)
  })
})

describe('programmeRect', () => {
  it('places a programme by its start and duration', () => {
    const rect = programmeRect({ start: at(20, 0), stop: at(21, 30) }, TODAY, 4)!
    expect(rect.left).toBe(20 * 60 * 4)
    expect(rect.width).toBe(90 * 4)
    expect(rect.clippedStart).toBe(false)
    expect(rect.clippedEnd).toBe(false)
  })

  it('clips a programme that starts before the window', () => {
    const rect = programmeRect({ start: at(23, 0, -1), stop: at(0, 30) }, TODAY, 4)!
    expect(rect.left).toBe(0)
    expect(rect.width).toBe(30 * 4)
    expect(rect.clippedStart).toBe(true)
    expect(rect.clippedEnd).toBe(false)
  })

  it('clips a programme running past midnight so the late slot still shows', () => {
    const rect = programmeRect({ start: at(23, 30), stop: at(1, 0, 1) }, TODAY, 4)!
    expect(rect.left).toBe(23.5 * 60 * 4)
    expect(rect.width).toBe(30 * 4)
    expect(rect.clippedEnd).toBe(true)
  })

  it('excludes programmes outside the window entirely', () => {
    expect(programmeRect({ start: at(10, 0, -2), stop: at(11, 0, -2) }, TODAY, 4)).toBeNull()
    expect(programmeRect({ start: at(10, 0, 3), stop: at(11, 0, 3) }, TODAY, 4)).toBeNull()
  })

  it('excludes a programme that merely touches a window edge', () => {
    // Ending exactly at midnight belongs to the previous day, not this one; a
    // zero-width block in the grid would be an invisible click target.
    expect(programmeRect({ start: at(22, 0, -1), stop: TODAY.start }, TODAY, 4)).toBeNull()
    expect(programmeRect({ start: TODAY.end, stop: at(1, 0, 1) }, TODAY, 4)).toBeNull()
  })

  it('never produces a negative or zero width for an overlapping programme', () => {
    const rect = programmeRect({ start: at(12, 0), stop: at(12, 1) }, TODAY, 4)!
    expect(rect.width).toBeGreaterThan(0)
  })
})

describe('rulerSlots', () => {
  it('emits one slot per step across the window', () => {
    expect(rulerSlots(TODAY, 30)).toHaveLength(48)
    expect(rulerSlots(TODAY, 60)).toHaveLength(24)
  })

  it('starts at the window start and stops before its end', () => {
    const slots = rulerSlots(TODAY, 60)
    expect(slots[0]).toBe(TODAY.start)
    expect(slots.at(-1)).toBe(TODAY.end - HOUR_MS)
  })
})

describe('nowOffset', () => {
  it('places the marker inside the current window', () => {
    expect(nowOffset(NOW, TODAY, 4)).toBe(14.5 * 60 * 4)
  })

  it('returns null for a window that does not contain now', () => {
    expect(nowOffset(NOW, dayWindow(1, NOW), 4)).toBeNull()
    expect(nowOffset(NOW, dayWindow(-1, NOW), 4)).toBeNull()
  })
})

describe('programmeAt', () => {
  const entries = [
    { id: 'a', start: at(20, 0), stop: at(21, 0) },
    { id: 'b', start: at(21, 0), stop: at(22, 0) },
  ].map((e) => ({ ...e, title: '', description: '', nowPlaying: false, hasArchive: false }))

  it('finds the programme covering an instant', () => {
    expect(programmeAt(entries, at(20, 30))?.id).toBe('a')
  })

  it('treats the boundary as belonging to the later programme', () => {
    expect(programmeAt(entries, at(21, 0))?.id).toBe('b')
  })

  it('returns null in a gap in the guide', () => {
    expect(programmeAt(entries, at(19, 0))).toBeNull()
    expect(programmeAt(entries, at(23, 0))).toBeNull()
  })
})

describe('scrollOffsetFor', () => {
  it('leaves a lead-in so the current programme is not flush to the edge', () => {
    expect(scrollOffsetFor(at(14, 0), TODAY, 4, 30)).toBe(13.5 * 60 * 4)
  })

  it('never scrolls past the window start', () => {
    expect(scrollOffsetFor(at(0, 10), TODAY, 4, 30)).toBe(0)
  })

  it('scales the lead-in with the zoom level', () => {
    expect(scrollOffsetFor(at(12, 0), TODAY, 2, 30)).toBe(11.5 * 60 * 2)
  })
})

describe('MINUTE_MS', () => {
  it('is the unit the layout maths is expressed in', () => {
    expect(MINUTE_MS).toBe(60_000)
    expect(HOUR_MS).toBe(60 * MINUTE_MS)
  })
})
