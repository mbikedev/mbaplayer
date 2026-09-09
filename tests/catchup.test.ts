import { describe, expect, it } from 'vitest'
import {
  VIEWER_CLOCK,
  catchupUrlCandidates,
  formatTimeshiftStart,
  isReplayable,
  portalClockFrom,
  programmeMinutes,
  replayStatus,
  type PortalClock,
} from '@/lib/catchup'
import type { AccountInfo } from '@/lib/xtream-types'

function account(patch: Partial<AccountInfo>): AccountInfo {
  return {
    username: 'demo',
    status: 'Active',
    message: '',
    isTrial: false,
    expiresAt: null,
    activeConnections: 1,
    maxConnections: 2,
    createdAt: null,
    allowedFormats: ['m3u8'],
    serverTimezone: null,
    serverTimeNow: null,
    serverTimestampNow: null,
    ...patch,
  }
}

describe('portalClockFrom', () => {
  it('derives the offset from the portal reporting the same moment two ways', () => {
    // 12:00 UTC reported as 14:00 wall clock means the portal runs at UTC+2.
    const clock = portalClockFrom(
      account({
        serverTimestampNow: Date.UTC(2026, 8, 9, 12, 0, 0),
        serverTimeNow: '2026-09-09 14:00:00',
      }),
    )
    expect(clock.offsetMs).toBe(2 * 3_600_000)
  })

  it('handles a portal behind UTC', () => {
    const clock = portalClockFrom(
      account({
        serverTimestampNow: Date.UTC(2026, 8, 9, 12, 0, 0),
        serverTimeNow: '2026-09-09 07:00:00',
      }),
    )
    expect(clock.offsetMs).toBe(-5 * 3_600_000)
  })

  it('rounds away sub-minute clock skew', () => {
    const clock = portalClockFrom(
      account({
        serverTimestampNow: Date.UTC(2026, 8, 9, 12, 0, 17),
        serverTimeNow: '2026-09-09 14:00:00',
      }),
    )
    expect(clock.offsetMs).toBe(2 * 3_600_000)
  })

  it('keeps the timezone name when the portal sends one', () => {
    expect(portalClockFrom(account({ serverTimezone: 'Europe/Paris' })).timeZone).toBe(
      'Europe/Paris',
    )
  })

  it('reports an unusable clock when the portal says nothing', () => {
    const clock = portalClockFrom(account({}))
    expect(clock.timeZone).toBeNull()
    expect(Number.isFinite(clock.offsetMs)).toBe(false)
  })

  it('ignores an unparseable time string rather than producing a wrong offset', () => {
    const clock = portalClockFrom(
      account({ serverTimestampNow: Date.UTC(2026, 8, 9, 12, 0), serverTimeNow: 'bientôt' }),
    )
    expect(Number.isFinite(clock.offsetMs)).toBe(false)
  })
})

describe('formatTimeshiftStart', () => {
  const noon = Date.UTC(2026, 8, 9, 12, 0, 0)

  it('formats in the portal timezone when one is known', () => {
    const clock: PortalClock = { timeZone: 'Europe/Paris', offsetMs: Number.NaN }
    expect(formatTimeshiftStart(noon, clock)).toBe('2026-09-09:14-00')
  })

  it('uses the timezone across a daylight-saving change, where a fixed offset fails', () => {
    // Paris is UTC+2 in summer and UTC+1 in winter. A recording made in
    // October must not be asked for with the offset measured in September.
    const clock: PortalClock = { timeZone: 'Europe/Paris', offsetMs: 2 * 3_600_000 }
    const winter = Date.UTC(2026, 10, 15, 12, 0, 0)
    expect(formatTimeshiftStart(winter, clock)).toBe('2026-11-15:13-00')
  })

  it('falls back to the measured offset when there is no timezone', () => {
    const clock: PortalClock = { timeZone: null, offsetMs: 2 * 3_600_000 }
    expect(formatTimeshiftStart(noon, clock)).toBe('2026-09-09:14-00')
  })

  it('falls back to the offset when the timezone name is not recognised', () => {
    const clock: PortalClock = { timeZone: 'Mars/Olympus_Mons', offsetMs: 3_600_000 }
    expect(formatTimeshiftStart(noon, clock)).toBe('2026-09-09:13-00')
  })

  it('rolls the date over when the offset crosses midnight', () => {
    const clock: PortalClock = { timeZone: null, offsetMs: 3 * 3_600_000 }
    expect(formatTimeshiftStart(Date.UTC(2026, 8, 9, 22, 30), clock)).toBe('2026-09-10:01-30')

    const behind: PortalClock = { timeZone: null, offsetMs: -3 * 3_600_000 }
    expect(formatTimeshiftStart(Date.UTC(2026, 8, 9, 1, 30), behind)).toBe('2026-09-08:22-30')
  })

  it('renders midnight as 00, never 24', () => {
    const clock: PortalClock = { timeZone: 'Europe/Paris', offsetMs: Number.NaN }
    expect(formatTimeshiftStart(Date.UTC(2026, 8, 8, 22, 0), clock)).toBe('2026-09-09:00-00')
  })

  it('zero-pads every field', () => {
    const clock: PortalClock = { timeZone: null, offsetMs: 0 }
    expect(formatTimeshiftStart(Date.UTC(2026, 0, 5, 3, 7), clock)).toBe('2026-01-05:03-07')
  })
})

describe('programmeMinutes', () => {
  it('measures the programme in whole minutes', () => {
    expect(programmeMinutes({ start: 0, stop: 90 * 60_000 })).toBe(90)
  })

  it('never returns zero, which would ask for an empty recording', () => {
    expect(programmeMinutes({ start: 0, stop: 1000 })).toBe(1)
    expect(programmeMinutes({ start: 0, stop: 0 })).toBe(1)
  })
})

describe('catchupUrlCandidates', () => {
  const request = {
    host: 'http://p.tv:8080',
    username: 'example-user',
    password: 'not-a-real-password',
    streamId: '42',
    start: Date.UTC(2026, 8, 9, 18, 0),
    durationMinutes: 90,
    clock: { timeZone: null, offsetMs: 2 * 3_600_000 } as PortalClock,
  }

  it('builds the modern path form first', () => {
    expect(catchupUrlCandidates(request)[0]).toBe(
      'http://p.tv:8080/timeshift/example-user/not-a-real-password/90/2026-09-09:20-00/42.m3u8',
    )
  })

  it('offers the legacy timeshift.php form as a fallback', () => {
    const legacy = new URL(catchupUrlCandidates(request)[1])
    expect(legacy.pathname).toBe('/streaming/timeshift.php')
    expect(legacy.searchParams.get('stream')).toBe('42')
    expect(legacy.searchParams.get('start')).toBe('2026-09-09:20-00')
    expect(legacy.searchParams.get('duration')).toBe('90')
    expect(legacy.searchParams.get('password')).toBe('not-a-real-password')
  })

  it('percent-encodes credentials in the path form', () => {
    const [path] = catchupUrlCandidates({ ...request, username: 'a b', password: 'p/w' })
    expect(path).toContain('/timeshift/a%20b/p%2Fw/')
  })

  it('tolerates a trailing slash on the stored host', () => {
    expect(catchupUrlCandidates({ ...request, host: 'http://p.tv:8080/' })[0]).toContain(
      'http://p.tv:8080/timeshift/',
    )
  })

  it('falls back to the viewer clock without throwing', () => {
    expect(catchupUrlCandidates({ ...request, clock: VIEWER_CLOCK })).toHaveLength(2)
  })
})

describe('replayStatus', () => {
  const now = Date.UTC(2026, 8, 9, 20, 0)
  const hoursAgo = (h: number) => now - h * 3_600_000

  const archived = { hasArchive: true, archiveDays: 7 }

  it('allows a finished programme on an archiving channel', () => {
    expect(
      isReplayable({
        entry: { start: hoursAgo(3), stop: hoursAgo(2), hasArchive: true },
        channel: archived,
        now,
      }),
    ).toBe(true)
  })

  it('refuses a programme that has not finished', () => {
    expect(
      replayStatus({
        entry: { start: hoursAgo(1), stop: now + 3_600_000, hasArchive: true },
        channel: archived,
        now,
      }),
    ).toEqual({ replayable: false, reason: 'not-finished' })
  })

  it('refuses a channel with no archive at all', () => {
    expect(
      replayStatus({
        entry: { start: hoursAgo(3), stop: hoursAgo(2), hasArchive: false },
        channel: { hasArchive: false, archiveDays: 0 },
        now,
      }),
    ).toEqual({ replayable: false, reason: 'no-archive' })
  })

  it('trusts a per-programme archive flag even when the channel does not advertise one', () => {
    // Portals are inconsistent about which level carries the flag.
    expect(
      isReplayable({
        entry: { start: hoursAgo(3), stop: hoursAgo(2), hasArchive: true },
        channel: { hasArchive: false, archiveDays: 0 },
        now,
      }),
    ).toBe(true)
  })

  it('refuses a programme older than the archive window', () => {
    expect(
      replayStatus({
        entry: { start: hoursAgo(24 * 8), stop: hoursAgo(24 * 8 - 1), hasArchive: true },
        channel: archived,
        now,
      }),
    ).toEqual({ replayable: false, reason: 'expired' })
  })

  it('treats an unstated window as unbounded rather than as zero days', () => {
    expect(
      isReplayable({
        entry: { start: hoursAgo(24 * 30), stop: hoursAgo(24 * 30 - 1), hasArchive: true },
        channel: { hasArchive: true, archiveDays: 0 },
        now,
      }),
    ).toBe(true)
  })
})
