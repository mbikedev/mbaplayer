/**
 * What the app needs to reach a subscription.
 *
 * Two shapes, because two kinds of subscription exist in practice. Most
 * providers expose the Xtream Codes API and give out a host plus a username and
 * password. Some only ever hand out a playlist URL — `player_api.php` answers
 * 404 — and for those the playlist itself has to serve as the entire catalogue.
 *
 * The discriminant lets one set of catalogue functions serve both, so no screen
 * needs to know which kind of subscription it is showing.
 */

export interface XtreamCredentials {
  source: 'xtream'
  host: string
  username: string
  password: string
}

export interface PlaylistCredentials {
  source: 'm3u'
  /** The full playlist URL, credentials included, exactly as the provider gave it. */
  playlistUrl: string
  /**
   * XMLTV address, when the viewer supplied one.
   *
   * A playlist usually declares its own guide in the `x-tvg-url` header, which
   * is preferred. This is the override for the providers that declare nothing.
   */
  epgUrl?: string | null
}

export type Credentials = XtreamCredentials | PlaylistCredentials

export function isXtream(credentials: Credentials): credentials is XtreamCredentials {
  return credentials.source === 'xtream'
}

export function isPlaylist(credentials: Credentials): credentials is PlaylistCredentials {
  return credentials.source === 'm3u'
}

/** A label identifying the subscription, for headings and profile names. */
export function describeCredentials(credentials: Credentials): string {
  if (isXtream(credentials)) return credentials.host.replace(/^https?:\/\//, '')
  try {
    return new URL(credentials.playlistUrl).host
  } catch {
    return 'Playlist'
  }
}

/** Encodes a stream URL for the `u` parameter of the media proxy. */
export function proxiedStreamUrl(directUrl: string): string {
  const bytes = new TextEncoder().encode(directUrl)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  const encoded = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `/api/stream?u=${encoded}`
}
