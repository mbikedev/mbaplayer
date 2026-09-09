import type { Category, Episode, LiveChannel, Movie, Season, Series, SeriesDetail } from './xtream-types'

/**
 * M3U playlist parsing.
 *
 * Some subscriptions only ever expose a playlist URL — `player_api.php`
 * answers 404 — so the playlist has to serve as the whole catalogue. It is a
 * far poorer source than the API: no plot, no cast, no rating, no season
 * artwork, and no structured EPG. Everything below is about recovering as much
 * shape as the format allows.
 */

export interface M3uEntry {
  /** Display name, from the text after the comma on the #EXTINF line. */
  name: string
  url: string
  /** `tvg-id`, the key an XMLTV guide would join on. */
  tvgId: string | null
  tvgName: string | null
  logo: string | null
  group: string | null
}

export interface ParsedM3u {
  entries: M3uEntry[]
  /** `x-tvg-url` from the #EXTM3U header, when the provider declares one. */
  epgUrl: string | null
}

/** Attributes on an #EXTINF line: key="value", values may contain spaces. */
const ATTRIBUTE_PATTERN = /([\w-]+)="([^"]*)"/g

function attributes(line: string): Record<string, string> {
  const found: Record<string, string> = {}
  for (const match of line.matchAll(ATTRIBUTE_PATTERN)) {
    found[match[1].toLowerCase()] = match[2]
  }
  return found
}

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed || trimmed.toLowerCase() === 'null' || trimmed === '-') return null
  return trimmed
}

function httpUrl(value: string | undefined): string | null {
  const trimmed = clean(value)
  return trimmed && /^https?:\/\//i.test(trimmed) ? trimmed : null
}

/**
 * Parses a playlist body.
 *
 * Tolerant on purpose: providers emit CRLF, stray blank lines, comment lines
 * other than #EXTINF, and occasionally an #EXTINF with no URL after it. None of
 * those should lose the rest of the playlist.
 */
export function parseM3u(body: string): ParsedM3u {
  const lines = body.split(/\r?\n/)
  const entries: M3uEntry[] = []
  let epgUrl: string | null = null
  let pending: Omit<M3uEntry, 'url'> | null = null

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    if (line.toUpperCase().startsWith('#EXTM3U')) {
      const header = attributes(line)
      epgUrl = httpUrl(header['x-tvg-url'] ?? header['url-tvg'])
      continue
    }

    if (line.toUpperCase().startsWith('#EXTINF')) {
      const attrs = attributes(line)
      // The display name is whatever follows the last comma on the line, which
      // is after the attributes — names themselves routinely contain commas.
      const commaIndex = line.indexOf(',', line.lastIndexOf('"') + 1)
      const name = commaIndex >= 0 ? line.slice(commaIndex + 1).trim() : ''

      pending = {
        name: name || clean(attrs['tvg-name']) || 'Sans nom',
        tvgId: clean(attrs['tvg-id']),
        tvgName: clean(attrs['tvg-name']),
        logo: httpUrl(attrs['tvg-logo']),
        group: clean(attrs['group-title']),
      }
      continue
    }

    // Any other directive (#EXTGRP, #EXTVLCOPT, …) is not a URL; skip it
    // without dropping the #EXTINF it belongs to.
    if (line.startsWith('#')) continue

    if (pending) {
      entries.push({ ...pending, url: line })
      pending = null
    }
  }

  return { entries, epgUrl }
}

export type EntryKind = 'live' | 'movie' | 'series'

/**
 * Decides what an entry is.
 *
 * An Xtream-generated playlist puts the answer in the URL path (`/live/`,
 * `/movie/`, `/series/`), which is authoritative. Other generators do not, so
 * the group name and the file extension are the fallback: a playlist entry
 * with a video container is on-demand, a bare stream is live.
 */
export function classifyEntry(entry: M3uEntry): EntryKind {
  const path = pathOf(entry.url).toLowerCase()

  if (/\/series\//.test(path)) return 'series'
  if (/\/(movie|movies|vod)\//.test(path)) return 'movie'
  if (/\/live\//.test(path)) return 'live'

  const group = (entry.group ?? '').toLowerCase()
  if (/\bs[ée]ries?\b|\bshows?\b/.test(group)) return 'series'
  if (/\bvod\b|\bfilms?\b|\bmovies?\b|\bcin[ée]ma\b/.test(group)) return 'movie'

  // A container extension means a file, which means on-demand. `.ts` and
  // `.m3u8` are how live streams are served, so they stay live.
  if (/\.(mp4|mkv|avi|m4v|mov|webm)$/.test(path)) {
    return looksLikeEpisode(entry.name) ? 'series' : 'movie'
  }

  return 'live'
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname
  } catch {
    return url
  }
}

/**
 * Stable id for an entry.
 *
 * An Xtream-shaped URL ends in the numeric stream id the API would have
 * returned, so reusing it keeps ids consistent between the two modes. Anything
 * else gets a hash of the URL, which is stable across reloads as long as the
 * provider does not move the stream.
 */
export function entryId(entry: M3uEntry): string {
  const path = pathOf(entry.url)
  const xtreamId = /\/(\d+)(?:\.[a-z0-9]+)?$/i.exec(path)
  if (xtreamId) return xtreamId[1]
  return `h${hash(entry.url)}`
}

function hash(value: string): string {
  // FNV-1a: short, dependency-free, and good enough to key a catalogue.
  let h = 0x811c9dc5
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(36)
}

/** Container extension, defaulting to what the stream type usually is. */
export function entryExtension(entry: M3uEntry, kind: EntryKind): string {
  const match = /\.([a-z0-9]{2,5})$/i.exec(pathOf(entry.url))
  if (match) return match[1].toLowerCase()
  return kind === 'live' ? 'm3u8' : 'mp4'
}

/* --------------------------------- Series --------------------------------- */

const EPISODE_PATTERNS = [
  /^(.*?)[\s._-]+s(\d{1,3})[\s._-]*e(\d{1,4})\b.*$/i, // Show S01E02, Show S01 E02
  /^(.*?)[\s._-]+(\d{1,2})x(\d{1,3})\b.*$/i, // Show 1x02
  /^(.*?)[\s._-]+season[\s._-]*(\d{1,3})[\s._-]*episode[\s._-]*(\d{1,4})\b.*$/i,
]

export interface EpisodeName {
  show: string
  season: number
  episode: number
}

/**
 * Splits "Breaking Bad S01 E03" into its parts.
 *
 * A playlist has no series structure at all — every episode is just another
 * flat entry — so the only way to present seasons is to read them out of the
 * name. Returns null when the name carries no episode marker, in which case the
 * entry is treated as a film rather than invented into a one-episode series.
 */
export function parseEpisodeName(name: string): EpisodeName | null {
  for (const pattern of EPISODE_PATTERNS) {
    const match = pattern.exec(name)
    if (!match) continue
    const show = match[1].replace(/[\s._-]+$/, '').trim()
    const season = Number(match[2])
    const episode = Number(match[3])
    if (!show || !Number.isFinite(season) || !Number.isFinite(episode)) continue
    return { show, season, episode }
  }
  return null
}

function looksLikeEpisode(name: string): boolean {
  return parseEpisodeName(name) !== null
}

/* -------------------------------- Catalogue -------------------------------- */

export interface M3uCatalog {
  liveCategories: Category[]
  live: LiveChannel[]
  movieCategories: Category[]
  movies: Movie[]
  seriesCategories: Category[]
  series: Series[]
  seriesDetail: Map<string, SeriesDetail>
  /** `${kind}:${id}` to the playlist's own stream URL. */
  urlByKey: Map<string, string>
  epgUrl: string | null
}

function categoryId(name: string): string {
  return `g${hash(name)}`
}

function toCategories(names: Iterable<string>): Category[] {
  return [...new Set(names)]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'fr'))
    .map((name) => ({ id: categoryId(name), name }))
}

const UNGROUPED = 'Sans catégorie'

/**
 * Turns a parsed playlist into the same shapes the Xtream API produces, so
 * every screen can stay unchanged.
 */
export function buildCatalog(parsed: ParsedM3u): M3uCatalog {
  const live: LiveChannel[] = []
  const movies: Movie[] = []
  const urlByKey = new Map<string, string>()

  const liveGroups: string[] = []
  const movieGroups: string[] = []
  const seriesGroups: string[] = []

  // Episodes are collected per show before being turned into series, because a
  // show's seasons are spread across the flat list in no particular order.
  const showEpisodes = new Map<
    string,
    { name: string; group: string; logo: string | null; episodes: Episode[] }
  >()

  parsed.entries.forEach((entry, index) => {
    const kind = classifyEntry(entry)
    const group = entry.group ?? UNGROUPED
    const id = entryId(entry)
    const extension = entryExtension(entry, kind)

    if (kind === 'live') {
      liveGroups.push(group)
      live.push({
        id,
        num: index + 1,
        name: entry.name,
        icon: entry.logo,
        categoryId: categoryId(group),
        epgChannelId: entry.tvgId,
        // A playlist says nothing about recordings, and guessing would put a
        // "Revoir" button on programmes that cannot be replayed.
        hasArchive: false,
        archiveDays: 0,
      })
      urlByKey.set(`live:${id}`, entry.url)
      return
    }

    if (kind === 'series') {
      const parsedName = parseEpisodeName(entry.name)
      if (parsedName) {
        seriesGroups.push(group)
        const key = parsedName.show.toLowerCase()
        const show = showEpisodes.get(key) ?? {
          name: parsedName.show,
          group,
          logo: entry.logo,
          episodes: [],
        }
        show.logo ??= entry.logo
        show.episodes.push({
          id,
          episodeNum: parsedName.episode,
          season: parsedName.season,
          title: entry.name,
          extension,
          plot: null,
          duration: null,
          image: entry.logo,
        })
        showEpisodes.set(key, show)
        urlByKey.set(`series:${id}`, entry.url)
        return
      }
      // Classified as a series by its URL but with no episode marker in the
      // name: nothing to group it under, so it is listed as a film.
    }

    movieGroups.push(group)
    movies.push({
      id,
      num: index + 1,
      name: entry.name,
      poster: entry.logo,
      rating: null,
      categoryId: categoryId(group),
      extension,
      added: null,
    })
    urlByKey.set(`movie:${id}`, entry.url)
  })

  const series: Series[] = []
  const seriesDetail = new Map<string, SeriesDetail>()

  for (const [key, show] of showEpisodes) {
    const id = `s${hash(key)}`
    const episodesBySeason: Record<number, Episode[]> = {}
    for (const episode of show.episodes) {
      ;(episodesBySeason[episode.season] ??= []).push(episode)
    }
    for (const list of Object.values(episodesBySeason)) {
      list.sort((a, b) => a.episodeNum - b.episodeNum)
    }

    const seasons: Season[] = Object.keys(episodesBySeason)
      .map(Number)
      .sort((a, b) => a - b)
      .map((number) => ({
        number,
        name: `Saison ${number}`,
        cover: show.logo,
        overview: null,
        episodeCount: episodesBySeason[number].length,
      }))

    const entry: Series = {
      id,
      num: series.length + 1,
      name: show.name,
      poster: show.logo,
      rating: null,
      categoryId: categoryId(show.group),
      plot: null,
      genre: null,
      releaseDate: null,
    }
    series.push(entry)
    seriesDetail.set(id, {
      ...entry,
      cast: null,
      director: null,
      backdrop: null,
      seasons,
      episodesBySeason,
    })
  }

  series.sort((a, b) => a.name.localeCompare(b.name, 'fr'))

  return {
    liveCategories: toCategories(liveGroups),
    live,
    movieCategories: toCategories(movieGroups),
    movies,
    seriesCategories: toCategories(seriesGroups),
    series,
    seriesDetail,
    urlByKey,
    epgUrl: parsed.epgUrl,
  }
}
