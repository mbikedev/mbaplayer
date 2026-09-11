import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET, HEAD } from '@/app/api/stream/route'
import { decodeTarget, encodeTarget } from '@/lib/server/safe-fetch'

/**
 * Integration tests for the media proxy route. A public IP literal is used as
 * the upstream so the SSRF guard passes without touching DNS, and `fetch` is
 * stubbed so no request leaves the process.
 */

const UPSTREAM = 'http://93.184.216.34:8080/live/alice/pass/42.m3u8'

function request(url: string, headers: Record<string, string> = {}): Request {
  return new Request(`http://app.local/api/stream?u=${encodeTarget(url)}`, { headers })
}

function stubFetch(response: Response, finalUrl = UPSTREAM) {
  Object.defineProperty(response, 'url', { value: finalUrl })
  const spy = vi.fn().mockResolvedValue(response)
  vi.stubGlobal('fetch', spy)
  return spy
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('GET /api/stream', () => {
  it('rewrites a playlist so segments come back through the proxy', async () => {
    stubFetch(
      new Response('#EXTM3U\n#EXTINF:10,\nseg-1.ts\n', {
        headers: { 'content-type': 'application/vnd.apple.mpegurl' },
      }),
    )

    const response = await GET(request(UPSTREAM))
    const body = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/vnd.apple.mpegurl')
    const segment = body.split('\n')[2]
    expect(segment.startsWith('/api/stream?u=')).toBe(true)
    expect(decodeTarget(new URL(segment, 'http://app.local').searchParams.get('u')!)).toBe(
      'http://93.184.216.34:8080/live/alice/pass/seg-1.ts',
    )
  })

  it('resolves playlist URIs against the URL reached after redirects', async () => {
    stubFetch(
      new Response('#EXTM3U\nseg.ts', { headers: { 'content-type': 'application/x-mpegurl' } }),
      'http://93.184.216.34:8080/edge/session123/42.m3u8',
    )

    const body = await (await GET(request(UPSTREAM))).text()
    const segment = body.split('\n')[1]
    expect(decodeTarget(new URL(segment, 'http://app.local').searchParams.get('u')!)).toBe(
      'http://93.184.216.34:8080/edge/session123/seg.ts',
    )
  })

  it('forwards the Range header and the 206 response so seeking works', async () => {
    const upstream = 'http://93.184.216.34:8080/movie/alice/pass/7.mp4'
    const spy = stubFetch(
      new Response('partial', {
        status: 206,
        headers: {
          'content-type': 'video/mp4',
          'content-range': 'bytes 100-199/5000',
          'accept-ranges': 'bytes',
        },
      }),
      upstream,
    )

    const response = await GET(request(upstream, { range: 'bytes=100-199' }))

    expect(spy.mock.calls[0][1].headers.Range).toBe('bytes=100-199')
    expect(response.status).toBe(206)
    expect(response.headers.get('content-range')).toBe('bytes 100-199/5000')
    expect(response.headers.get('accept-ranges')).toBe('bytes')
  })

  it('never lets a media response be cached', async () => {
    stubFetch(new Response('x', { headers: { 'content-type': 'video/mp2t' } }))
    const response = await GET(request(UPSTREAM))
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('refuses a target that the SSRF guard rejects', async () => {
    const spy = stubFetch(new Response('should not be reached'))
    const response = await GET(request('http://127.0.0.1:9000/secret'))

    expect(response.status).toBe(400)
    expect(spy).not.toHaveBeenCalled()
  })

  it('rejects a request with no target', async () => {
    const response = await GET(new Request('http://app.local/api/stream'))
    expect(response.status).toBe(400)
  })

  it('reports an upstream failure as a gateway error', async () => {
    stubFetch(new Response('nope', { status: 403, statusText: 'Forbidden' }))
    const response = await GET(request(UPSTREAM))
    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toHaveProperty('error')
  })

  it('passes a 404 through as a 404', async () => {
    stubFetch(new Response('', { status: 404, statusText: 'Not Found' }))
    expect((await GET(request(UPSTREAM))).status).toBe(404)
  })
})

describe('HEAD /api/stream', () => {
  it('returns the upstream headers with no body', async () => {
    const spy = stubFetch(
      new Response(null, {
        status: 200,
        headers: { 'content-type': 'video/mp4', 'content-length': '5000' },
      }),
    )

    const response = await HEAD(request(UPSTREAM))

    expect(spy.mock.calls[0][1].method).toBe('HEAD')
    expect(response.headers.get('content-length')).toBe('5000')
    expect(await response.text()).toBe('')
  })
})

describe('client disconnect', () => {
  /**
   * The player abandons a stream on every channel switch. The upstream fetch
   * has to go with it: on a `max_connections: 1` subscription a connection
   * left open until the timeout keeps the only slot, and the channel being
   * switched to is refused.
   */
  it('aborts the upstream fetch when the player stops reading', async () => {
    const controller = new AbortController()
    let upstreamSignal: AbortSignal | undefined

    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) => {
        upstreamSignal = init.signal ?? undefined
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('', 'AbortError')))
        })
      }),
    )

    const pending = GET(
      new Request(`http://app.local/api/stream?u=${encodeTarget(UPSTREAM)}`, {
        signal: controller.signal,
      }),
    )

    // Let the route reach its fetch before the player walks away.
    await Promise.resolve()
    expect(upstreamSignal?.aborted).toBe(false)

    controller.abort()
    const response = await pending

    expect(upstreamSignal?.aborted).toBe(true)
    expect(response.status).toBe(499)
  })
})
