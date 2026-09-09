import { afterEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/m3u/route'

/**
 * Integration tests for the playlist proxy. A public IP literal keeps the SSRF
 * guard happy without touching DNS, and `fetch` is stubbed so nothing leaves
 * the process.
 */

const PLAYLIST_URL = 'http://93.184.216.34:8080/get.php?username=example-user&password=secret-value'

function request(url: unknown): Request {
  return new Request('http://app.local/api/m3u', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url }),
  })
}

/** A body delivered as a stream, the way the route actually reads it. */
function streamed(text: string, init: ResponseInit = {}): Response {
  const bytes = new TextEncoder().encode(text)
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(bytes)
        controller.close()
      },
    }),
    init,
  )
}

function stubFetch(response: Response) {
  const spy = vi.fn().mockResolvedValue(response)
  vi.stubGlobal('fetch', spy)
  return spy
}

const PLAYLIST = '#EXTM3U\n#EXTINF:-1 group-title="FR",TF1\nhttp://93.184.216.34:8080/live/u/p/1.ts\n'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('POST /api/m3u', () => {
  it('returns the playlist body as plain text', async () => {
    stubFetch(streamed(PLAYLIST))

    const response = await POST(request(PLAYLIST_URL))

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/plain')
    expect(await response.text()).toBe(PLAYLIST)
  })

  it('never caches a playlist response', async () => {
    stubFetch(streamed(PLAYLIST))
    expect((await POST(request(PLAYLIST_URL))).headers.get('cache-control')).toBe('no-store')
  })

  it('rejects a body that is not a playlist, whatever the status says', async () => {
    // A provider refusing the credentials usually answers 200 with an HTML
    // error page, so the status alone cannot be trusted.
    stubFetch(streamed('<html><body>Access denied</body></html>', { status: 200 }))

    const response = await POST(request(PLAYLIST_URL))
    const body = (await response.json()) as { error: string }

    expect(response.status).toBe(502)
    expect(body.error).toContain('playlist M3U')
  })

  it('accepts a playlist whose header line is missing but has entries', async () => {
    stubFetch(streamed('#EXTINF:-1,TF1\nhttp://93.184.216.34:8080/live/u/p/1.ts'))
    expect((await POST(request(PLAYLIST_URL))).status).toBe(200)
  })

  it('masks the credentials in every error it reports', async () => {
    // This message is shown on screen; leaking the playlist URL leaks the
    // account, because the credentials are inside it.
    stubFetch(streamed('<html>nope</html>'))

    const body = (await (await POST(request(PLAYLIST_URL))).json()) as { error: string }

    expect(body.error).not.toContain('secret-value')
    expect(body.error).toContain('***')
  })

  it('refuses a target the SSRF guard rejects, before any request', async () => {
    const spy = stubFetch(streamed(PLAYLIST))

    const response = await POST(request('http://127.0.0.1:8080/get.php'))

    expect(response.status).toBe(400)
    expect(spy).not.toHaveBeenCalled()
  })

  it('rejects a missing or non-string url', async () => {
    expect((await POST(request(undefined))).status).toBe(400)
    expect((await POST(request(42))).status).toBe(400)
    expect((await POST(request('   '))).status).toBe(400)
  })

  it('rejects a malformed JSON body', async () => {
    const response = await POST(
      new Request('http://app.local/api/m3u', { method: 'POST', body: 'not json' }),
    )
    expect(response.status).toBe(400)
  })

  it('reports an upstream HTTP failure as a gateway error', async () => {
    stubFetch(streamed('', { status: 403, statusText: 'Forbidden' }))
    expect((await POST(request(PLAYLIST_URL))).status).toBe(502)
  })

  it('reports a timeout distinctly, since big playlists are slow to generate', async () => {
    const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeout))

    const body = (await (await POST(request(PLAYLIST_URL))).json()) as { error: string }

    expect(body.error).toContain('temps')
  })

  it('stops reading once a playlist exceeds the size cap', async () => {
    // Emitted in chunks forever: the route has to stop on its own rather than
    // buffer whatever the far end decides to send.
    let cancelled = false
    const endless = new Response(
      new ReadableStream({
        pull(controller) {
          controller.enqueue(new Uint8Array(4 * 1024 * 1024))
        },
        cancel() {
          cancelled = true
        },
      }),
    )
    stubFetch(endless)

    const response = await POST(request(PLAYLIST_URL))
    const body = (await response.json()) as { error: string }

    expect(response.status).toBe(502)
    expect(body.error).toContain('volumineuse')
    expect(cancelled).toBe(true)
  }, 30_000)
})
