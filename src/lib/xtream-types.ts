/**
 * Shapes returned by an Xtream Codes compatible portal (`player_api.php`).
 *
 * Portals are wildly inconsistent about types: the same field can be a number
 * on one server and a numeric string on another, and optional fields are often
 * omitted entirely. Every raw type below therefore uses `unknown`-ish widening
 * and is normalised through the helpers in `xtream-normalize.ts` before the UI
 * ever touches it.
 */

export type Numeric = number | string

export interface RawUserInfo {
  username?: string
  password?: string
  message?: string
  auth?: Numeric
  status?: string
  exp_date?: Numeric | null
  is_trial?: Numeric
  active_cons?: Numeric
  created_at?: Numeric
  max_connections?: Numeric
  allowed_output_formats?: string[]
}

export interface RawServerInfo {
  url?: string
  port?: Numeric
  https_port?: Numeric
  server_protocol?: string
  rtmp_port?: Numeric
  timezone?: string
  timestamp_now?: Numeric
  time_now?: string
}

export interface RawAuthResponse {
  user_info?: RawUserInfo
  server_info?: RawServerInfo
}

export interface RawCategory {
  category_id?: Numeric
  category_name?: string
  parent_id?: Numeric
}

export interface RawLiveStream {
  num?: Numeric
  name?: string
  stream_type?: string
  stream_id?: Numeric
  stream_icon?: string
  epg_channel_id?: string | null
  added?: Numeric
  category_id?: Numeric
  tv_archive?: Numeric
  tv_archive_duration?: Numeric
  direct_source?: string
}

export interface RawVodStream {
  num?: Numeric
  name?: string
  title?: string
  stream_type?: string
  stream_id?: Numeric
  stream_icon?: string
  cover?: string
  rating?: Numeric
  rating_5based?: Numeric
  added?: Numeric
  category_id?: Numeric
  container_extension?: string
  direct_source?: string
}

export interface RawSeries {
  num?: Numeric
  name?: string
  title?: string
  series_id?: Numeric
  cover?: string
  plot?: string
  cast?: string
  director?: string
  genre?: string
  releaseDate?: string
  release_date?: string
  last_modified?: Numeric
  rating?: Numeric
  rating_5based?: Numeric
  backdrop_path?: string[] | string
  youtube_trailer?: string
  episode_run_time?: Numeric
  category_id?: Numeric
}

export interface RawEpisodeInfo {
  movie_image?: string
  cover_big?: string
  plot?: string
  description?: string
  duration?: string
  duration_secs?: Numeric
  releasedate?: string
  rating?: Numeric
  bitrate?: Numeric
}

export interface RawEpisode {
  id?: Numeric
  episode_num?: Numeric
  title?: string
  container_extension?: string
  season?: Numeric
  added?: Numeric
  direct_source?: string
  info?: RawEpisodeInfo
}

export interface RawSeason {
  season_number?: Numeric
  name?: string
  cover?: string
  cover_big?: string
  overview?: string
  air_date?: string
  episode_count?: Numeric
}

export interface RawSeriesInfo {
  info?: RawSeries & { cover_big?: string; backdrop_path?: string[] | string }
  seasons?: RawSeason[]
  episodes?: Record<string, RawEpisode[]> | RawEpisode[]
}

export interface RawVodInfoBlock {
  movie_image?: string
  cover_big?: string
  backdrop_path?: string[] | string
  plot?: string
  description?: string
  cast?: string
  director?: string
  genre?: string
  releasedate?: string
  release_date?: string
  rating?: Numeric
  duration?: string
  duration_secs?: Numeric
  youtube_trailer?: string
  country?: string
}

export interface RawVodInfo {
  info?: RawVodInfoBlock
  movie_data?: RawVodStream
}

export interface RawEpgListing {
  id?: Numeric
  epg_id?: Numeric
  title?: string
  lang?: string
  start?: string
  end?: string
  description?: string
  channel_id?: string
  start_timestamp?: Numeric
  stop_timestamp?: Numeric
  now_playing?: Numeric
  has_archive?: Numeric
}

export interface RawEpgResponse {
  epg_listings?: RawEpgListing[]
}

/* ------------------------------------------------------------------ */
/* Normalised shapes — everything below this line is what the UI uses. */
/* ------------------------------------------------------------------ */

export interface Category {
  id: string
  name: string
}

export interface LiveChannel {
  id: string
  num: number
  name: string
  icon: string | null
  categoryId: string
  epgChannelId: string | null
  hasArchive: boolean
}

export interface Movie {
  id: string
  num: number
  name: string
  poster: string | null
  rating: number | null
  categoryId: string
  extension: string
  added: number | null
}

export interface Series {
  id: string
  num: number
  name: string
  poster: string | null
  rating: number | null
  categoryId: string
  plot: string | null
  genre: string | null
  releaseDate: string | null
}

export interface MovieDetail extends Movie {
  plot: string | null
  cast: string | null
  director: string | null
  genre: string | null
  releaseDate: string | null
  duration: string | null
  backdrop: string | null
  youtubeTrailer: string | null
  country: string | null
}

export interface Episode {
  id: string
  episodeNum: number
  season: number
  title: string
  extension: string
  plot: string | null
  duration: string | null
  image: string | null
}

export interface Season {
  number: number
  name: string
  cover: string | null
  overview: string | null
  episodeCount: number | null
}

export interface SeriesDetail extends Series {
  cast: string | null
  director: string | null
  backdrop: string | null
  seasons: Season[]
  episodesBySeason: Record<number, Episode[]>
}

export interface EpgEntry {
  id: string
  title: string
  description: string
  start: number
  stop: number
  nowPlaying: boolean
}

export interface AccountInfo {
  username: string
  status: string
  message: string
  isTrial: boolean
  expiresAt: number | null
  activeConnections: number
  maxConnections: number
  createdAt: number | null
  allowedFormats: string[]
  serverTimezone: string | null
  serverTimeNow: string | null
}
