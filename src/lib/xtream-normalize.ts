import type {
  AccountInfo,
  Category,
  EpgEntry,
  Episode,
  LiveChannel,
  Movie,
  MovieDetail,
  Numeric,
  RawAuthResponse,
  RawCategory,
  RawEpgListing,
  RawEpisode,
  RawLiveStream,
  RawSeason,
  RawSeries,
  RawSeriesInfo,
  RawVodInfo,
  RawVodStream,
  Season,
  Series,
  SeriesDetail,
} from './xtream-types'

export function str(value: Numeric | null | undefined, fallback = ''): string {
  if (value === null || value === undefined) return fallback
  const s = String(value).trim()
  return s === '' ? fallback : s
}

export function num(value: Numeric | null | undefined, fallback = 0): number {
  if (value === null || value === undefined) return fallback
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

export function optionalNum(value: Numeric | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export function bool(value: Numeric | null | undefined): boolean {
  const s = str(value).toLowerCase()
  return s === '1' || s === 'true' || s === 'yes'
}

/** Portals return absolute image URLs, empty strings, or the literal "null". */
export function image(value: string | null | undefined): string | null {
  const s = str(value)
  if (!s || s === 'null' || s === 'undefined') return null
  if (!/^https?:\/\//i.test(s)) return null
  return s
}

function firstBackdrop(value: string[] | string | undefined): string | null {
  if (Array.isArray(value)) return image(value[0])
  return image(value)
}

/**
 * EPG titles and descriptions are base64 encoded by every Xtream portal, but a
 * handful return plain text. Decoding is therefore best-effort: if the result
 * is not valid UTF-8 or the input was not base64, the original is kept.
 */
export function decodeEpgText(value: string | undefined): string {
  const s = str(value)
  if (!s) return ''
  if (!/^[A-Za-z0-9+/=\r\n]+$/.test(s) || s.length % 4 !== 0) return s
  try {
    const binary = typeof atob === 'function' ? atob(s) : Buffer.from(s, 'base64').toString('binary')
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return decoded.trim() || s
  } catch {
    return s
  }
}

/** Portal timestamps are seconds; the app works in milliseconds throughout. */
function secondsToMs(value: Numeric | null | undefined): number | null {
  const n = optionalNum(value)
  return n === null ? null : n * 1000
}

/**
 * Resolves an EPG boundary to milliseconds.
 *
 * `start_timestamp` / `stop_timestamp` are epoch seconds and are what nearly
 * every portal sends. The `start` / `end` strings are the fallback, and they
 * carry no offset — "2026-09-09 20:00:00" is in the *portal's* timezone, which
 * is not necessarily the viewer's. They are read as UTC, which is the only
 * defensible reading without an offset, so a portal that sends only strings can
 * place programmes on a shifted clock. Returns null when neither is usable, so
 * the entry is dropped rather than landing at the epoch.
 */
function epgBoundary(
  timestamp: Numeric | null | undefined,
  text: string | undefined,
): number | null {
  const fromTimestamp = secondsToMs(timestamp)
  if (fromTimestamp !== null) return fromTimestamp

  const raw = str(text)
  if (!raw) return null

  // "YYYY-MM-DD HH:MM:SS" is not an ISO string until the space becomes a T.
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(raw)
    ? `${raw.replace(' ', 'T')}Z`
    : raw
  const parsed = Date.parse(iso)
  return Number.isFinite(parsed) ? parsed : null
}

export function normalizeAccount(raw: RawAuthResponse): AccountInfo {
  const user = raw.user_info ?? {}
  const server = raw.server_info ?? {}
  return {
    username: str(user.username),
    status: str(user.status, 'Unknown'),
    message: str(user.message),
    isTrial: bool(user.is_trial),
    expiresAt: secondsToMs(user.exp_date),
    activeConnections: num(user.active_cons),
    maxConnections: num(user.max_connections),
    createdAt: secondsToMs(user.created_at),
    allowedFormats: Array.isArray(user.allowed_output_formats)
      ? user.allowed_output_formats.map((f) => str(f)).filter(Boolean)
      : [],
    serverTimezone: str(server.timezone) || null,
    serverTimeNow: str(server.time_now) || null,
    serverTimestampNow: secondsToMs(server.timestamp_now),
  }
}

export function isAuthenticated(raw: RawAuthResponse): boolean {
  const user = raw.user_info
  if (!user) return false
  // `auth` is 1 on success. Some portals omit it and only set `status`.
  if (user.auth !== undefined) return num(user.auth) === 1
  return str(user.status).toLowerCase() === 'active'
}

export function normalizeCategories(raw: RawCategory[] | null | undefined): Category[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((c) => ({ id: str(c.category_id), name: str(c.category_name, 'Sans nom') }))
    .filter((c) => c.id !== '')
}

export function normalizeLiveChannels(raw: RawLiveStream[] | null | undefined): LiveChannel[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((s, index) => ({
      id: str(s.stream_id),
      num: num(s.num, index + 1),
      name: str(s.name, 'Chaîne sans nom'),
      icon: image(s.stream_icon),
      categoryId: str(s.category_id),
      epgChannelId: str(s.epg_channel_id) || null,
      hasArchive: bool(s.tv_archive),
      archiveDays: num(s.tv_archive_duration),
    }))
    .filter((c) => c.id !== '')
}

export function normalizeMovies(raw: RawVodStream[] | null | undefined): Movie[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((s, index) => ({
      id: str(s.stream_id),
      num: num(s.num, index + 1),
      name: str(s.name) || str(s.title, 'Sans titre'),
      poster: image(s.stream_icon) ?? image(s.cover),
      rating: optionalNum(s.rating_5based) ?? optionalNum(s.rating),
      categoryId: str(s.category_id),
      extension: str(s.container_extension, 'mp4'),
      added: optionalNum(s.added),
    }))
    .filter((m) => m.id !== '')
}

export function normalizeSeriesList(raw: RawSeries[] | null | undefined): Series[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((s, index) => ({
      id: str(s.series_id),
      num: num(s.num, index + 1),
      name: str(s.name) || str(s.title, 'Sans titre'),
      poster: image(s.cover),
      rating: optionalNum(s.rating_5based) ?? optionalNum(s.rating),
      categoryId: str(s.category_id),
      plot: str(s.plot) || null,
      genre: str(s.genre) || null,
      releaseDate: str(s.releaseDate) || str(s.release_date) || null,
    }))
    .filter((s) => s.id !== '')
}

export function normalizeMovieDetail(raw: RawVodInfo, fallbackId: string): MovieDetail | null {
  const info = raw.info ?? {}
  const data = raw.movie_data ?? {}
  const id = str(data.stream_id, fallbackId)
  if (!id) return null
  return {
    id,
    num: num(data.num, 0),
    name: str(data.name) || str(data.title, 'Sans titre'),
    poster: image(info.movie_image) ?? image(info.cover_big) ?? image(data.stream_icon),
    rating: optionalNum(info.rating) ?? optionalNum(data.rating_5based),
    categoryId: str(data.category_id),
    extension: str(data.container_extension, 'mp4'),
    added: optionalNum(data.added),
    plot: str(info.plot) || str(info.description) || null,
    cast: str(info.cast) || null,
    director: str(info.director) || null,
    genre: str(info.genre) || null,
    releaseDate: str(info.releasedate) || str(info.release_date) || null,
    duration: str(info.duration) || null,
    backdrop: firstBackdrop(info.backdrop_path),
    youtubeTrailer: str(info.youtube_trailer) || null,
    country: str(info.country) || null,
  }
}

function normalizeEpisode(raw: RawEpisode, seasonHint: number): Episode | null {
  const id = str(raw.id)
  if (!id) return null
  const info = raw.info ?? {}
  return {
    id,
    episodeNum: num(raw.episode_num, 0),
    season: num(raw.season, seasonHint),
    title: str(raw.title, `Épisode ${num(raw.episode_num, 0)}`),
    extension: str(raw.container_extension, 'mp4'),
    plot: str(info.plot) || str(info.description) || null,
    duration: str(info.duration) || null,
    image: image(info.movie_image) ?? image(info.cover_big),
  }
}

function normalizeSeason(raw: RawSeason): Season {
  return {
    number: num(raw.season_number),
    name: str(raw.name) || `Saison ${num(raw.season_number)}`,
    cover: image(raw.cover_big) ?? image(raw.cover),
    overview: str(raw.overview) || null,
    episodeCount: optionalNum(raw.episode_count),
  }
}

export function normalizeSeriesDetail(raw: RawSeriesInfo, fallbackId: string): SeriesDetail | null {
  const info = raw.info ?? {}
  const id = str(info.series_id, fallbackId)
  if (!id) return null

  const episodesBySeason: Record<number, Episode[]> = {}
  const rawEpisodes = raw.episodes

  // `episodes` is keyed by season number, but a few portals return a flat array.
  if (Array.isArray(rawEpisodes)) {
    for (const rawEpisode of rawEpisodes) {
      const episode = normalizeEpisode(rawEpisode, num(rawEpisode.season, 1))
      if (!episode) continue
      ;(episodesBySeason[episode.season] ??= []).push(episode)
    }
  } else if (rawEpisodes && typeof rawEpisodes === 'object') {
    for (const [key, list] of Object.entries(rawEpisodes)) {
      if (!Array.isArray(list)) continue
      const seasonNumber = num(key, 1)
      for (const rawEpisode of list) {
        const episode = normalizeEpisode(rawEpisode, seasonNumber)
        if (!episode) continue
        ;(episodesBySeason[seasonNumber] ??= []).push(episode)
      }
    }
  }

  for (const list of Object.values(episodesBySeason)) {
    list.sort((a, b) => a.episodeNum - b.episodeNum)
  }

  // Prefer the portal's season list, but fall back to the seasons that actually
  // have episodes — plenty of portals send `seasons: []` while episodes exist.
  const declared = Array.isArray(raw.seasons) ? raw.seasons.map(normalizeSeason) : []
  const withEpisodes = Object.keys(episodesBySeason).map(Number).sort((a, b) => a - b)
  const seasons = declared.length
    ? declared.filter((s) => episodesBySeason[s.number]?.length).sort((a, b) => a.number - b.number)
    : []
  const seasonList = seasons.length
    ? seasons
    : withEpisodes.map((n) => ({
        number: n,
        name: `Saison ${n}`,
        cover: null,
        overview: null,
        episodeCount: episodesBySeason[n]?.length ?? null,
      }))

  return {
    id,
    num: num(info.num, 0),
    name: str(info.name) || str(info.title, 'Sans titre'),
    poster: image(info.cover_big) ?? image(info.cover),
    rating: optionalNum(info.rating_5based) ?? optionalNum(info.rating),
    categoryId: str(info.category_id),
    plot: str(info.plot) || null,
    genre: str(info.genre) || null,
    releaseDate: str(info.releaseDate) || str(info.release_date) || null,
    cast: str(info.cast) || null,
    director: str(info.director) || null,
    backdrop: firstBackdrop(info.backdrop_path),
    seasons: seasonList,
    episodesBySeason,
  }
}

export function normalizeEpg(raw: RawEpgListing[] | null | undefined): EpgEntry[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((e, index) => {
      const start = epgBoundary(e.start_timestamp, e.start)
      const stop = epgBoundary(e.stop_timestamp, e.end)
      if (start === null || stop === null) return null
      return {
        id: str(e.id, String(index)),
        title: decodeEpgText(e.title),
        description: decodeEpgText(e.description),
        start,
        stop,
        nowPlaying: bool(e.now_playing),
        hasArchive: bool(e.has_archive),
      }
    })
    // A programme that ends before it starts is corrupt, not just odd: it would
    // render as a negative-width block in the guide.
    .filter((e): e is EpgEntry => e !== null && e.stop > e.start)
    .sort((a, b) => a.start - b.start)
}
