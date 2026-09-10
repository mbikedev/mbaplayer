import { proxiedStreamUrl, type PlaylistCredentials } from './credentials'
import { buildCatalog, parseM3u, type M3uCatalog } from './m3u'
import { parseXmltv } from './xmltv'
import type { StreamKind } from './portal'
import type {
  Category,
  EpgEntry,
  LiveChannel,
  Movie,
  MovieDetail,
  Series,
  SeriesDetail,
} from './xtream-types'

/**
 * Catalogue backed by an M3U playlist.
 *
 * The whole playlist is fetched and parsed once, then everything is served from
 * memory. There is no per-category endpoint to call — a playlist is one flat
 * document — so this is both the simplest and the only workable shape.
 */

export class PlaylistError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PlaylistError'
  }
}

/**
 * Parsed playlists, keyed by URL, for the lifetime of the tab.
 *
 * Re-fetching would mean pulling tens of megabytes again, so this is kept until
 * the user explicitly refreshes. The promise rather than the value is cached so
 * that several screens mounting at once share a single request.
 */
const cache = new Map<string, Promise<M3uCatalog>>()

export function clearPlaylistCache(): void {
  cache.clear()
  clearGuideCache()
}

async function fetchCatalog(playlistUrl: string): Promise<M3uCatalog> {
  let response: Response
  try {
    response = await fetch('/api/m3u', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: playlistUrl }),
    })
  } catch {
    throw new PlaylistError('Connexion impossible. Vérifiez votre réseau.')
  }

  if (!response.ok) {
    let message = `Erreur ${response.status}.`
    try {
      const payload = (await response.json()) as { error?: unknown }
      if (payload.error) message = String(payload.error)
    } catch {
      // The route answers JSON on failure; if it did not, the status stands.
    }
    throw new PlaylistError(message)
  }

  const catalog = buildCatalog(parseM3u(await response.text()))

  if (catalog.live.length === 0 && catalog.movies.length === 0 && catalog.series.length === 0) {
    throw new PlaylistError('La playlist ne contient aucune chaîne lisible.')
  }

  return catalog
}

export function loadCatalog(credentials: PlaylistCredentials): Promise<M3uCatalog> {
  const key = credentials.playlistUrl
  const existing = cache.get(key)
  if (existing) return existing

  // A failed load must not be cached, or a transient network error would stick
  // for the rest of the session.
  const pending = fetchCatalog(key).catch((error: unknown) => {
    cache.delete(key)
    throw error
  })
  cache.set(key, pending)
  return pending
}

/* ------------------------------- Catalogue ------------------------------- */

export async function getLiveCategories(c: PlaylistCredentials): Promise<Category[]> {
  return (await loadCatalog(c)).liveCategories
}

export async function getLiveChannels(c: PlaylistCredentials): Promise<LiveChannel[]> {
  return (await loadCatalog(c)).live
}

export async function getMovieCategories(c: PlaylistCredentials): Promise<Category[]> {
  return (await loadCatalog(c)).movieCategories
}

export async function getMovies(c: PlaylistCredentials): Promise<Movie[]> {
  return (await loadCatalog(c)).movies
}

export async function getSeriesCategories(c: PlaylistCredentials): Promise<Category[]> {
  return (await loadCatalog(c)).seriesCategories
}

export async function getSeries(c: PlaylistCredentials): Promise<Series[]> {
  return (await loadCatalog(c)).series
}

export async function getSeriesDetail(
  c: PlaylistCredentials,
  seriesId: string,
): Promise<SeriesDetail | null> {
  return (await loadCatalog(c)).seriesDetail.get(seriesId) ?? null
}

/**
 * A playlist carries no synopsis, cast, rating or runtime, so a film's detail
 * page is built from its catalogue entry alone. The fields that do not exist
 * are null rather than invented.
 */
export async function getMovieDetail(
  c: PlaylistCredentials,
  movieId: string,
): Promise<MovieDetail | null> {
  const movie = (await loadCatalog(c)).movies.find((entry) => entry.id === movieId)
  if (!movie) return null
  return {
    ...movie,
    plot: null,
    cast: null,
    director: null,
    genre: null,
    releaseDate: null,
    duration: null,
    backdrop: null,
    youtubeTrailer: null,
    country: null,
  }
}

/**
 * The playlist's own URL for an item, proxied.
 *
 * Unlike the API mode there is no URL to construct: the playlist gave the
 * address, and it is the only one known to work.
 */
export async function streamUrl(
  c: PlaylistCredentials,
  kind: StreamKind,
  streamId: string,
): Promise<string | null> {
  const direct = (await loadCatalog(c)).urlByKey.get(`${kind}:${streamId}`)
  return direct ? proxiedStreamUrl(direct) : null
}

/** The XMLTV address the playlist header declares, if any. */
export async function getEpgUrl(c: PlaylistCredentials): Promise<string | null> {
  return (await loadCatalog(c)).epgUrl
}

/* ----------------------------------- Guide ----------------------------------- */

/**
 * Parsed guides, keyed by XMLTV address, for the lifetime of the tab.
 *
 * One guide covers every channel at once — unlike the Xtream API, there is no
 * per-channel endpoint — so it is fetched once and read from memory after that.
 */
const guideCache = new Map<string, Promise<Map<string, EpgEntry[]>>>()

export function clearGuideCache(): void {
  guideCache.clear()
}

/** The guide address in force: the viewer's override, else the playlist's own. */
export async function resolveEpgUrl(c: PlaylistCredentials): Promise<string | null> {
  const override = c.epgUrl?.trim()
  if (override) return override
  return (await loadCatalog(c)).epgUrl
}

async function fetchGuide(
  epgUrl: string,
  channelIds: ReadonlySet<string>,
): Promise<Map<string, EpgEntry[]>> {
  let response: Response
  try {
    response = await fetch('/api/xmltv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: epgUrl }),
    })
  } catch {
    throw new PlaylistError('Connexion impossible au guide.')
  }

  if (!response.ok) {
    let message = `Erreur ${response.status}.`
    try {
      const payload = (await response.json()) as { error?: unknown }
      if (payload.error) message = String(payload.error)
    } catch {
      // The route answers JSON on failure; if it did not, the status stands.
    }
    throw new PlaylistError(message)
  }

  // Filtering to the playlist's own channels is what keeps this affordable: a
  // provider's guide covers its whole line-up, which is routinely many times
  // what one subscription's playlist carries.
  return parseXmltv(await response.text(), { channelIds })
}

async function loadGuide(c: PlaylistCredentials): Promise<Map<string, EpgEntry[]>> {
  const epgUrl = await resolveEpgUrl(c)
  if (!epgUrl) return new Map()

  const existing = guideCache.get(epgUrl)
  if (existing) return existing

  const catalog = await loadCatalog(c)
  const channelIds = new Set(
    catalog.live.map((channel) => channel.epgChannelId).filter((id): id is string => Boolean(id)),
  )

  // A failed load must not be cached, or one network blip would leave the guide
  // empty for the rest of the session.
  const pending = fetchGuide(epgUrl, channelIds).catch((error: unknown) => {
    guideCache.delete(epgUrl)
    throw error
  })
  guideCache.set(epgUrl, pending)
  return pending
}

/** Whether a guide can be shown at all for this subscription. */
export async function hasGuide(c: PlaylistCredentials): Promise<boolean> {
  return (await resolveEpgUrl(c)) !== null
}

/**
 * Programmes for one channel.
 *
 * The join is the playlist's `tvg-id` against XMLTV's `channel` attribute. A
 * channel carrying no tvg-id cannot be matched to a guide entry at all, and
 * returns empty rather than guessing by name.
 */
export async function getChannelEpg(
  c: PlaylistCredentials,
  streamId: string,
): Promise<EpgEntry[]> {
  try {
    const catalog = await loadCatalog(c)
    const channel = catalog.live.find((entry) => entry.id === streamId)
    if (!channel?.epgChannelId) return []
    return (await loadGuide(c)).get(channel.epgChannelId) ?? []
  } catch {
    // A missing guide is the normal case for many providers, not an error worth
    // interrupting the grid for.
    return []
  }
}

/** "Now and next" for one channel, taken from the same guide. */
export async function getShortEpg(
  c: PlaylistCredentials,
  streamId: string,
  limit = 6,
  now: number = Date.now(),
): Promise<EpgEntry[]> {
  const entries = await getChannelEpg(c, streamId)
  const currentIndex = entries.findIndex((entry) => entry.stop > now)
  if (currentIndex < 0) return []
  return entries.slice(currentIndex, currentIndex + limit)
}
