import { encodeTarget } from './safe-fetch'

/**
 * Rewrites the URIs inside an HLS playlist to point back at the stream proxy.
 *
 * Without this, the player would take the segment URLs straight from the
 * playlist and request them from the portal directly — which fails for the same
 * two reasons the proxy exists at all: no CORS headers, and an http origin that
 * an https page may not load.
 *
 * URLs appear in exactly two places: bare lines (media segments and variant
 * playlists) and `URI="…"` attributes (EXT-X-KEY, EXT-X-MEDIA, EXT-X-MAP).
 * Comment lines that are not tags carry nothing to rewrite.
 */
export function rewritePlaylist(body: string, base: URL): string {
  return body
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim()
      if (!trimmed) return line

      if (trimmed.startsWith('#')) {
        return line.replace(/URI="([^"]+)"/g, (_match, uri: string) => `URI="${proxied(uri, base)}"`)
      }

      return proxied(trimmed, base)
    })
    .join('\n')
}

/**
 * Resolves a possibly-relative playlist URI against the playlist's own URL and
 * wraps it in a proxy link. An unparseable value is left alone rather than
 * corrupted.
 */
function proxied(rawUrl: string, base: URL): string {
  try {
    return `/api/stream?u=${encodeTarget(new URL(rawUrl, base).toString())}`
  } catch {
    return rawUrl
  }
}

const HLS_CONTENT_TYPES = [
  'application/vnd.apple.mpegurl',
  'application/x-mpegurl',
  'audio/mpegurl',
  'audio/x-mpegurl',
]

/** Portals are inconsistent about the content type, so the path is checked too. */
export function isHlsPlaylist(url: URL, contentType: string): boolean {
  if (HLS_CONTENT_TYPES.some((type) => contentType.toLowerCase().includes(type))) return true
  return /\.m3u8?(\?|$)/i.test(url.pathname + url.search)
}
