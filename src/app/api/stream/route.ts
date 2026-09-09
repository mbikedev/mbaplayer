import { NextResponse } from 'next/server'
import { isHlsPlaylist, rewritePlaylist } from '@/lib/server/hls-rewrite'
import { UnsafeUrlError, assertFetchableUrl, decodeTarget } from '@/lib/server/safe-fetch'

/**
 * Streams media from the portal through the app's own origin.
 *
 * Same reasons as the player_api proxy — no CORS headers upstream, and http
 * portals are unreachable from an https page — plus one extra: HLS playlists
 * reference their segments by URL, so the playlist body has to be rewritten to
 * point back at this route or the player would go direct and fail again.
 */

const USER_AGENT = 'MBAPlayer/1.0 (Xtream Codes client)'
const REQUEST_TIMEOUT_MS = 30_000

/** Headers worth forwarding from the upstream response to the player. */
const PASSTHROUGH_RESPONSE_HEADERS = [
  'content-type',
  'content-length',
  'content-range',
  'accept-ranges',
  'last-modified',
  'etag',
]

async function handle(request: Request, method: 'GET' | 'HEAD') {
  const encoded = new URL(request.url).searchParams.get('u')
  if (!encoded) {
    return NextResponse.json({ error: 'Paramètre « u » manquant.' }, { status: 400 })
  }

  let targetUrl: URL
  try {
    targetUrl = await assertFetchableUrl(decodeTarget(encoded))
  } catch (error) {
    if (error instanceof UnsafeUrlError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ error: 'Cible de flux invalide.' }, { status: 400 })
  }

  const upstreamHeaders: Record<string, string> = {
    'User-Agent': USER_AGENT,
    Accept: '*/*',
  }
  // Seeking in a movie depends on byte ranges reaching the origin.
  const range = request.headers.get('range')
  if (range) upstreamHeaders.Range = range

  let upstream: Response
  try {
    upstream = await fetch(targetUrl, {
      method,
      headers: upstreamHeaders,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: 'no-store',
      redirect: 'follow',
    })
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError'
    return NextResponse.json(
      { error: timedOut ? 'Le flux n’a pas répondu à temps.' : 'Impossible de joindre le flux.' },
      { status: 502 },
    )
  }

  const responseHeaders = new Headers()
  for (const header of PASSTHROUGH_RESPONSE_HEADERS) {
    const value = upstream.headers.get(header)
    if (value) responseHeaders.set(header, value)
  }
  responseHeaders.set('Cache-Control', 'no-store')

  if (!upstream.ok && upstream.status !== 206) {
    return NextResponse.json(
      { error: `Le flux a répondu ${upstream.status} ${upstream.statusText}.` },
      { status: upstream.status === 404 ? 404 : 502 },
    )
  }

  if (method === 'HEAD') {
    return new NextResponse(null, { status: upstream.status, headers: responseHeaders })
  }

  const contentType = upstream.headers.get('content-type') ?? ''

  // `upstream.url` is the URL after redirects, which is the correct base for
  // resolving the relative segment paths inside the playlist.
  const finalUrl = (() => {
    try {
      return new URL(upstream.url || targetUrl.toString())
    } catch {
      return targetUrl
    }
  })()

  if (isHlsPlaylist(finalUrl, contentType)) {
    const body = await upstream.text()
    responseHeaders.set('Content-Type', 'application/vnd.apple.mpegurl')
    responseHeaders.delete('content-length')
    return new NextResponse(rewritePlaylist(body, finalUrl), {
      status: upstream.status,
      headers: responseHeaders,
    })
  }

  if (!responseHeaders.has('content-type')) {
    responseHeaders.set('Content-Type', 'video/mp2t')
  }

  // Segments and progressive files are piped straight through so playback can
  // start before the whole body has arrived.
  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  })
}

export async function GET(request: Request) {
  return handle(request, 'GET')
}

export async function HEAD(request: Request) {
  return handle(request, 'HEAD')
}
