import { buildStreamUrl, type StreamKind } from './portal'
import {
  isAuthenticated,
  normalizeAccount,
  normalizeCategories,
  normalizeEpg,
  normalizeLiveChannels,
  normalizeMovieDetail,
  normalizeMovies,
  normalizeSeriesDetail,
  normalizeSeriesList,
} from './xtream-normalize'
import type {
  AccountInfo,
  Category,
  EpgEntry,
  LiveChannel,
  Movie,
  MovieDetail,
  RawAuthResponse,
  RawCategory,
  RawEpgResponse,
  RawLiveStream,
  RawSeries,
  RawSeriesInfo,
  RawVodInfo,
  RawVodStream,
  Series,
  SeriesDetail,
} from './xtream-types'

export interface Credentials {
  host: string
  username: string
  password: string
}

export class XtreamError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'XtreamError'
  }
}

/**
 * Catalogue responses are large (tens of thousands of entries is normal) and
 * change rarely, so each action is cached in memory for the tab's lifetime.
 * Reloading the page refetches; the "Actualiser" action clears it explicitly.
 */
const CACHE_TTL_MS = 5 * 60 * 1000
const cache = new Map<string, { at: number; value: unknown }>()

function cacheKey(credentials: Credentials, action: string, params: Record<string, string>): string {
  return JSON.stringify([credentials.host, credentials.username, action, params])
}

export function clearCatalogCache(): void {
  cache.clear()
}

async function call<T>(
  credentials: Credentials,
  action: string,
  params: Record<string, string> = {},
  options: { cacheable?: boolean } = {},
): Promise<T> {
  const key = cacheKey(credentials, action, params)
  if (options.cacheable) {
    const hit = cache.get(key)
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value as T
  }

  let response: Response
  try {
    response = await fetch('/api/xtream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...credentials, action, params }),
    })
  } catch {
    throw new XtreamError('Connexion impossible. Vérifiez votre réseau.')
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new XtreamError('Réponse illisible du serveur.')
  }

  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : `Erreur ${response.status}.`
    throw new XtreamError(message)
  }

  if (options.cacheable) cache.set(key, { at: Date.now(), value: payload })
  return payload as T
}

/** Verifies credentials and returns the account summary. */
export async function login(credentials: Credentials): Promise<AccountInfo> {
  const raw = await call<RawAuthResponse>(credentials, '')
  if (!isAuthenticated(raw)) {
    const message = raw.user_info?.message
    throw new XtreamError(
      message ? String(message) : 'Identifiants refusés par le portail.',
    )
  }
  const account = normalizeAccount(raw)
  if (account.status.toLowerCase() === 'expired') {
    throw new XtreamError('Cet abonnement est expiré.')
  }
  if (account.status.toLowerCase() === 'banned') {
    throw new XtreamError('Ce compte est banni du portail.')
  }
  return account
}

export async function getAccount(credentials: Credentials): Promise<AccountInfo> {
  return normalizeAccount(await call<RawAuthResponse>(credentials, ''))
}

export async function getLiveCategories(credentials: Credentials): Promise<Category[]> {
  return normalizeCategories(
    await call<RawCategory[]>(credentials, 'get_live_categories', {}, { cacheable: true }),
  )
}

export async function getLiveChannels(
  credentials: Credentials,
  categoryId?: string,
): Promise<LiveChannel[]> {
  const params: Record<string, string> = categoryId ? { category_id: categoryId } : {}
  return normalizeLiveChannels(
    await call<RawLiveStream[]>(credentials, 'get_live_streams', params, { cacheable: true }),
  )
}

export async function getMovieCategories(credentials: Credentials): Promise<Category[]> {
  return normalizeCategories(
    await call<RawCategory[]>(credentials, 'get_vod_categories', {}, { cacheable: true }),
  )
}

export async function getMovies(credentials: Credentials, categoryId?: string): Promise<Movie[]> {
  const params: Record<string, string> = categoryId ? { category_id: categoryId } : {}
  return normalizeMovies(
    await call<RawVodStream[]>(credentials, 'get_vod_streams', params, { cacheable: true }),
  )
}

export async function getMovieDetail(
  credentials: Credentials,
  movieId: string,
): Promise<MovieDetail | null> {
  const raw = await call<RawVodInfo>(
    credentials,
    'get_vod_info',
    { vod_id: movieId },
    { cacheable: true },
  )
  return normalizeMovieDetail(raw, movieId)
}

export async function getSeriesCategories(credentials: Credentials): Promise<Category[]> {
  return normalizeCategories(
    await call<RawCategory[]>(credentials, 'get_series_categories', {}, { cacheable: true }),
  )
}

export async function getSeries(credentials: Credentials, categoryId?: string): Promise<Series[]> {
  const params: Record<string, string> = categoryId ? { category_id: categoryId } : {}
  return normalizeSeriesList(
    await call<RawSeries[]>(credentials, 'get_series', params, { cacheable: true }),
  )
}

export async function getSeriesDetail(
  credentials: Credentials,
  seriesId: string,
): Promise<SeriesDetail | null> {
  const raw = await call<RawSeriesInfo>(
    credentials,
    'get_series_info',
    { series_id: seriesId },
    { cacheable: true },
  )
  return normalizeSeriesDetail(raw, seriesId)
}

/** Short EPG for a live channel — "now and next", not the full guide. */
export async function getShortEpg(
  credentials: Credentials,
  streamId: string,
  limit = 6,
): Promise<EpgEntry[]> {
  try {
    const raw = await call<RawEpgResponse>(credentials, 'get_short_epg', {
      stream_id: streamId,
      limit: String(limit),
    })
    return normalizeEpg(raw.epg_listings)
  } catch {
    // Plenty of portals have no EPG at all; an empty guide is not an error the
    // user needs to see while they are trying to watch something.
    return []
  }
}

/** Builds the proxied URL the player should load for a given stream. */
export function streamUrl(
  credentials: Credentials,
  kind: StreamKind,
  streamId: string,
  extension: string,
): string {
  const direct = buildStreamUrl({ ...credentials, kind, streamId, extension })
  return `/api/stream?u=${base64Url(direct)}`
}

function base64Url(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
