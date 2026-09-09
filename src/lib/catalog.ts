import { VIEWER_CLOCK, type PortalClock } from './catchup'
import { isPlaylist, type Credentials } from './credentials'
import * as playlist from './m3u-catalog'
import type { StreamKind } from './portal'
import * as xtream from './xtream'
import type {
  AccountInfo,
  Category,
  EpgEntry,
  LiveChannel,
  Movie,
  MovieDetail,
  Series,
  SeriesDetail,
} from './xtream-types'

/**
 * The catalogue, over whichever kind of subscription the profile uses.
 *
 * Every screen calls these and never learns which backend answered. The two
 * are not equivalent — a playlist has no synopsis, no guide and no catch-up —
 * so the functions that cannot be honoured return empty or null rather than
 * inventing data, and the screens say so.
 */

export { PlaylistError } from './m3u-catalog'
export { XtreamError } from './xtream'
export type { Credentials } from './credentials'

export function clearCatalogCache(): void {
  xtream.clearCatalogCache()
  playlist.clearPlaylistCache()
}

export interface SubscriptionSummary {
  /** Suggested profile name for a new profile. */
  label: string
  /** Null for a playlist, which carries no account at all. */
  account: AccountInfo | null
}

/** Verifies a subscription before anything about it is stored. */
export async function login(credentials: Credentials): Promise<SubscriptionSummary> {
  if (isPlaylist(credentials)) {
    // Loading the playlist is the only way to know the URL works, and it warms
    // the cache the catalogue screens are about to read.
    await playlist.loadCatalog(credentials)
    return { label: new URL(credentials.playlistUrl).host, account: null }
  }
  const account = await xtream.login(credentials)
  return { label: account.username, account }
}

/** Null in playlist mode: there is no account behind a playlist URL. */
export async function getAccount(credentials: Credentials): Promise<AccountInfo | null> {
  return isPlaylist(credentials) ? null : xtream.getAccount(credentials)
}

export async function getPortalClock(credentials: Credentials): Promise<PortalClock> {
  return isPlaylist(credentials) ? VIEWER_CLOCK : xtream.getPortalClock(credentials)
}

export async function getLiveCategories(credentials: Credentials): Promise<Category[]> {
  return isPlaylist(credentials)
    ? playlist.getLiveCategories(credentials)
    : xtream.getLiveCategories(credentials)
}

export async function getLiveChannels(credentials: Credentials): Promise<LiveChannel[]> {
  return isPlaylist(credentials)
    ? playlist.getLiveChannels(credentials)
    : xtream.getLiveChannels(credentials)
}

export async function getMovieCategories(credentials: Credentials): Promise<Category[]> {
  return isPlaylist(credentials)
    ? playlist.getMovieCategories(credentials)
    : xtream.getMovieCategories(credentials)
}

export async function getMovies(credentials: Credentials): Promise<Movie[]> {
  return isPlaylist(credentials) ? playlist.getMovies(credentials) : xtream.getMovies(credentials)
}

export async function getMovieDetail(
  credentials: Credentials,
  movieId: string,
): Promise<MovieDetail | null> {
  return isPlaylist(credentials)
    ? playlist.getMovieDetail(credentials, movieId)
    : xtream.getMovieDetail(credentials, movieId)
}

export async function getSeriesCategories(credentials: Credentials): Promise<Category[]> {
  return isPlaylist(credentials)
    ? playlist.getSeriesCategories(credentials)
    : xtream.getSeriesCategories(credentials)
}

export async function getSeries(credentials: Credentials): Promise<Series[]> {
  return isPlaylist(credentials) ? playlist.getSeries(credentials) : xtream.getSeries(credentials)
}

export async function getSeriesDetail(
  credentials: Credentials,
  seriesId: string,
): Promise<SeriesDetail | null> {
  return isPlaylist(credentials)
    ? playlist.getSeriesDetail(credentials, seriesId)
    : xtream.getSeriesDetail(credentials, seriesId)
}

/**
 * Programme guide.
 *
 * Empty in playlist mode. A playlist declares an XMLTV address at best, and
 * parsing that is a separate job the app does not do yet — so rather than half
 * a guide, the screens show why there is none.
 */
export async function getShortEpg(
  credentials: Credentials,
  streamId: string,
  limit?: number,
): Promise<EpgEntry[]> {
  return isPlaylist(credentials) ? [] : xtream.getShortEpg(credentials, streamId, limit)
}

export async function getChannelEpg(
  credentials: Credentials,
  streamId: string,
): Promise<EpgEntry[]> {
  return isPlaylist(credentials) ? [] : xtream.getChannelEpg(credentials, streamId)
}

/** True when the subscription can supply a programme guide at all. */
export function supportsGuide(credentials: Credentials): boolean {
  return !isPlaylist(credentials)
}

/**
 * The proxied URL to play.
 *
 * Asynchronous because a playlist's stream addresses come from the playlist
 * itself, which may still be loading. Returns null when the item is unknown.
 */
export async function streamUrl(
  credentials: Credentials,
  kind: StreamKind,
  streamId: string,
  extension: string,
): Promise<string | null> {
  return isPlaylist(credentials)
    ? playlist.streamUrl(credentials, kind, streamId)
    : xtream.streamUrl(credentials, kind, streamId, extension)
}

export async function catchupStreamUrls(
  credentials: Credentials,
  clock: PortalClock,
  streamId: string,
  start: number,
  durationMinutes: number,
): Promise<string[]> {
  // A playlist never reports catch-up (hasArchive is always false), so nothing
  // in the UI can reach this — but returning an empty list keeps that true even
  // if a future screen forgets to check.
  if (isPlaylist(credentials)) return []
  return xtream.catchupStreamUrls(credentials, clock, streamId, start, durationMinutes)
}
