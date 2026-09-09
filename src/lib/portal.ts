/**
 * Portal address handling, shared by the login form and the proxy routes.
 *
 * People paste all sorts of things into the "portal" field: a bare host, a host
 * with a port, the panel URL ending in `/c`, the `player_api.php` endpoint, or
 * a full `get.php` playlist URL with the credentials already in the query
 * string. All of them normalise down to a scheme + host + optional port.
 */

export interface PortalInput {
  host: string
  username?: string
  password?: string
}

const STRIPPED_PATH_SEGMENTS = [
  'player_api.php',
  'panel_api.php',
  'get.php',
  'xmltv.php',
  'portal.php',
  'c',
]

/**
 * Turns arbitrary user input into `scheme://host[:port]`, and pulls out
 * credentials when the input was a playlist URL.
 *
 * Throws when the input cannot be read as a URL at all.
 */
export function parsePortalInput(rawInput: string): PortalInput {
  const trimmed = rawInput.trim()
  if (!trimmed) throw new Error('Adresse du portail manquante.')

  // A bare host has no scheme; default to http, which is what most portals use.
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`

  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    throw new Error('Adresse du portail invalide.')
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Le portail doit utiliser http ou https.')
  }
  if (!url.hostname) throw new Error('Adresse du portail invalide.')

  const username = url.searchParams.get('username') ?? undefined
  const password = url.searchParams.get('password') ?? undefined

  // Keep any directory prefix the portal is mounted under, but drop the API
  // entrypoint itself so it is not doubled up when requests are built.
  const segments = url.pathname.split('/').filter(Boolean)
  while (segments.length && STRIPPED_PATH_SEGMENTS.includes(segments[segments.length - 1].toLowerCase())) {
    segments.pop()
  }
  const basePath = segments.length ? `/${segments.join('/')}` : ''

  return {
    host: `${url.protocol}//${url.host}${basePath}`,
    username: username || undefined,
    password: password || undefined,
  }
}

/** Normalises a stored host value, tolerating trailing slashes. */
export function normalizeHost(host: string): string {
  return host.trim().replace(/\/+$/, '')
}

export function playerApiUrl(host: string, params: Record<string, string>): string {
  const url = new URL(`${normalizeHost(host)}/player_api.php`)
  for (const [key, value] of Object.entries(params)) {
    if (value !== '') url.searchParams.set(key, value)
  }
  return url.toString()
}

export type StreamKind = 'live' | 'movie' | 'series'

export interface StreamUrlOptions {
  host: string
  username: string
  password: string
  kind: StreamKind
  streamId: string
  /** `m3u8` for live, or the portal-provided container for VOD/series. */
  extension: string
}

/**
 * Builds the direct media URL for a stream.
 *
 * Live uses `/live/…`; movies use `/movie/…`; episodes use `/series/…`. A few
 * very old portals serve live from the root instead, which is handled by the
 * fallback candidates below.
 */
export function buildStreamUrl({
  host,
  username,
  password,
  kind,
  streamId,
  extension,
}: StreamUrlOptions): string {
  const base = normalizeHost(host)
  const user = encodeURIComponent(username)
  const pass = encodeURIComponent(password)
  const id = encodeURIComponent(streamId)
  const ext = extension.replace(/^\./, '') || 'm3u8'
  const segment = kind === 'live' ? 'live' : kind === 'movie' ? 'movie' : 'series'
  return `${base}/${segment}/${user}/${pass}/${id}.${ext}`
}

/**
 * Ordered list of URLs to try for a live channel. Portals disagree on whether
 * the `/live/` segment is required, so the legacy root-level form is kept as a
 * fallback when the first attempt fails.
 */
export function liveStreamCandidates(options: Omit<StreamUrlOptions, 'kind'>): string[] {
  const base = normalizeHost(options.host)
  const user = encodeURIComponent(options.username)
  const pass = encodeURIComponent(options.password)
  const id = encodeURIComponent(options.streamId)
  const ext = options.extension.replace(/^\./, '') || 'm3u8'
  return [`${base}/live/${user}/${pass}/${id}.${ext}`, `${base}/${user}/${pass}/${id}.${ext}`]
}
