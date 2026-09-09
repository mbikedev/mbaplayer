import { normalizeHost } from './portal'
import type { AccountInfo, EpgEntry, LiveChannel } from './xtream-types'

/**
 * Catch-up (timeshift) playback.
 *
 * A portal records live channels for a few days and serves a past programme by
 * start time and duration. The critical detail is that the `start` parameter is
 * a *wall clock reading on the portal*, not a UTC instant and not the viewer's
 * local time — a viewer in Dakar asking a Paris portal for "20:00" would
 * otherwise get the wrong two hours.
 */

export interface PortalClock {
  /**
   * The portal's IANA timezone, when it reports one. Preferred over the offset
   * below: a fixed offset measured today is wrong for a programme recorded on
   * the other side of a daylight-saving change, which is well within the few
   * days of archive a portal keeps.
   */
  timeZone: string | null
  /**
   * Milliseconds to add to a UTC instant to read it as the portal's wall clock,
   * derived from the portal's own clock reading. Used when there is no usable
   * timezone name.
   */
  offsetMs: number
}

/** The viewer's own clock, used when the portal reports nothing usable. */
export const VIEWER_CLOCK: PortalClock = { timeZone: null, offsetMs: Number.NaN }

/**
 * Works out how to read instants the way the portal does.
 *
 * `server_info.time_now` is the portal's wall clock as a string and
 * `timestamp_now` is the same moment in epoch seconds, so the difference
 * between them is the portal's offset from UTC.
 */
export function portalClockFrom(account: AccountInfo | null | undefined): PortalClock {
  if (!account) return VIEWER_CLOCK

  const timeZone = account.serverTimezone?.trim() || null

  let offsetMs = Number.NaN
  if (account.serverTimeNow && account.serverTimestampNow !== null) {
    // Reading the wall-clock string as UTC turns the comparison into the offset.
    const asUtc = Date.parse(`${account.serverTimeNow.trim().replace(' ', 'T')}Z`)
    if (Number.isFinite(asUtc)) {
      // Portals report whole minutes; rounding keeps a second of clock skew
      // from shifting the formatted start time.
      offsetMs = Math.round((asUtc - account.serverTimestampNow) / 60_000) * 60_000
    }
  }

  return { timeZone, offsetMs }
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/**
 * Formats an instant as the portal's wall clock, in the `YYYY-MM-DD:HH-MM`
 * shape every Xtream panel expects for timeshift.
 *
 * Falls through three sources in order of reliability: the portal's timezone
 * (correct across daylight-saving changes), its measured offset, and finally
 * the viewer's own clock.
 */
export function formatTimeshiftStart(instant: number, clock: PortalClock): string {
  if (clock.timeZone) {
    const formatted = formatInTimeZone(instant, clock.timeZone)
    if (formatted) return formatted
  }

  if (Number.isFinite(clock.offsetMs)) {
    const shifted = new Date(instant + clock.offsetMs)
    return (
      `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}` +
      `:${pad(shifted.getUTCHours())}-${pad(shifted.getUTCMinutes())}`
    )
  }

  const local = new Date(instant)
  return (
    `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}` +
    `:${pad(local.getHours())}-${pad(local.getMinutes())}`
  )
}

/** Returns null when the runtime rejects the zone name the portal sent. */
function formatInTimeZone(instant: number, timeZone: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      // h23 rather than hour12:false: some engines render midnight as "24".
      hourCycle: 'h23',
    }).formatToParts(new Date(instant))

    const get = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? ''

    const [year, month, day, hour, minute] = [
      get('year'),
      get('month'),
      get('day'),
      get('hour'),
      get('minute'),
    ]
    if (!year || !month || !day || !hour || !minute) return null

    return `${year}-${month}-${day}:${hour}-${minute}`
  } catch {
    return null
  }
}

/** Programme length in whole minutes, at least one. */
export function programmeMinutes(entry: Pick<EpgEntry, 'start' | 'stop'>): number {
  return Math.max(1, Math.round((entry.stop - entry.start) / 60_000))
}

export interface CatchupRequest {
  host: string
  username: string
  password: string
  streamId: string
  /** Programme start as a UTC instant. */
  start: number
  durationMinutes: number
  clock: PortalClock
}

/**
 * The URLs to try for a recording, most likely first.
 *
 * Panels disagree on the shape. The path form is what current Xtream builds
 * serve and yields an HLS playlist a browser can play; the older
 * `timeshift.php` form is kept as a fallback, though several panels answer it
 * with raw MPEG-TS that no browser decodes.
 */
export function catchupUrlCandidates({
  host,
  username,
  password,
  streamId,
  start,
  durationMinutes,
  clock,
}: CatchupRequest): string[] {
  const base = normalizeHost(host)
  const user = encodeURIComponent(username)
  const pass = encodeURIComponent(password)
  const id = encodeURIComponent(streamId)
  const startedAt = formatTimeshiftStart(start, clock)
  const minutes = Math.max(1, Math.round(durationMinutes))

  const query = new URLSearchParams({
    username,
    password,
    stream: streamId,
    start: startedAt,
    duration: String(minutes),
  })

  return [
    `${base}/timeshift/${user}/${pass}/${minutes}/${startedAt}/${id}.m3u8`,
    `${base}/streaming/timeshift.php?${query.toString()}`,
  ]
}

export interface ReplayabilityInput {
  entry: Pick<EpgEntry, 'start' | 'stop' | 'hasArchive'>
  channel: Pick<LiveChannel, 'hasArchive' | 'archiveDays'>
  now: number
}

export type ReplayStatus =
  | { replayable: true }
  | { replayable: false; reason: 'not-finished' | 'no-archive' | 'expired' }

/**
 * Whether a recording should exist for a programme.
 *
 * The portal's per-programme `has_archive` flag is trusted when it is set, but
 * many portals never send it, so a channel-level archive window is enough on
 * its own. Nothing here can guarantee the recording plays — only the portal
 * knows that — so the UI still has to handle a failed stream.
 */
export function replayStatus({ entry, channel, now }: ReplayabilityInput): ReplayStatus {
  if (entry.stop > now) return { replayable: false, reason: 'not-finished' }
  if (!entry.hasArchive && !channel.hasArchive) return { replayable: false, reason: 'no-archive' }

  // `archiveDays` of 0 on an archive-capable channel means the portal did not
  // say how far back it keeps recordings, not that it keeps none.
  if (channel.archiveDays > 0) {
    const oldestKept = now - channel.archiveDays * 86_400_000
    if (entry.start < oldestKept) return { replayable: false, reason: 'expired' }
  }

  return { replayable: true }
}

export function isReplayable(input: ReplayabilityInput): boolean {
  return replayStatus(input).replayable
}
