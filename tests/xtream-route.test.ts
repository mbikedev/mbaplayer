import { afterEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/xtream/route'

/**
 * Integration tests for the portal proxy. As in the stream-route tests, a
 * public IP literal keeps the SSRF guard happy without DNS, and `fetch` is
 * stubbed so nothing leaves the process.
 */

const HOST = 'http://93.184.216.34:8080'

function request(body: unknown): Request {
  return new Request('http://app.local/api/xtream', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function stubFetch(response: Response) {
  const spy = vi.fn().mockResolvedValue(response)
  vi.stubGlobal('fetch', spy)
  return spy
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('POST /api/xtream', () => {
  it('builds the player_api URL from the posted credentials and action', async () => {
    const spy = stubFetch(new Response(JSON.stringify([{ category_id: '1' }])))

    await POST(
      request({
        host: HOST,
        username: 'example-user',
        password: 'not-a-real-password',
        action: 'get_live_streams',
        params: { category_id: 7 },
      }),
    )

    const called = new URL(spy.mock.calls[0][0])
    expect(called.pathname).toBe('/player_api.php')
    expect(called.searchParams.get('username')).toBe('example-user')
    expect(called.searchParams.get('password')).toBe('not-a-real-password')
    expect(called.searchParams.get('action')).toBe('get_live_streams')
    // Numbers are stringified rather than dropped.
    expect(called.searchParams.get('category_id')).toBe('7')
  })

  it('identifies as a known player, which some panels require', async () => {
    // Panels filter on User-Agent and answer an unrecognised client with 404 —
    // indistinguishable from a missing path. VLC is the signature they accept
    // most consistently, so a generic agent here would break real portals.
    const spy = stubFetch(new Response(JSON.stringify({ user_info: { auth: 1 } })))

    await POST(request({ host: HOST, username: 'example-user', password: 'not-a-real-password' }))

    const agent = String(spy.mock.calls[0][1].headers['User-Agent'])
    expect(agent).toMatch(/VLC/i)
    expect(agent).not.toMatch(/node|undici|MBAPlayer/i)
  })

  it('omits the action for the bare authentication call', async () => {
    const spy = stubFetch(new Response(JSON.stringify({ user_info: { auth: 1 } })))

    await POST(request({ host: HOST, username: 'example-user', password: 'not-a-real-password', action: '' }))

    expect(new URL(spy.mock.calls[0][0]).searchParams.has('action')).toBe(false)
  })

  it('keeps credentials out of the URL of its own response', async () => {
    stubFetch(new Response(JSON.stringify({ user_info: { auth: 1 } })))
    const response = await POST(request({ host: HOST, username: 'example-user', password: 'not-a-real-password' }))
    expect(response.url).not.toContain('not-a-real-password')
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('rejects a request with missing credentials', async () => {
    const spy = stubFetch(new Response('{}'))

    expect((await POST(request({ host: HOST, username: 'example-user' }))).status).toBe(400)
    expect((await POST(request({ username: 'a', password: 'b' }))).status).toBe(400)
    expect(spy).not.toHaveBeenCalled()
  })

  it('rejects a private portal address before any request is made', async () => {
    const spy = stubFetch(new Response('{}'))

    const response = await POST(
      request({ host: 'http://192.168.1.10:8080', username: 'a', password: 'b' }),
    )

    expect(response.status).toBe(400)
    expect(spy).not.toHaveBeenCalled()
  })

  it('rejects a malformed JSON body', async () => {
    const response = await POST(
      new Request('http://app.local/api/xtream', { method: 'POST', body: 'not json' }),
    )
    expect(response.status).toBe(400)
  })

  it('reports an HTML error page from the portal as unreadable', async () => {
    stubFetch(new Response('<html>Access denied</html>'))

    const response = await POST(request({ host: HOST, username: 'a', password: 'b' }))

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toHaveProperty('error')
  })

  it('names the attempted address on a 404 so the user can see what was wrong', async () => {
    stubFetch(new Response('', { status: 404, statusText: 'Not Found' }))

    const response = await POST(
      request({ host: HOST, username: 'example-user', password: 'not-a-real-password' }),
    )
    const body = (await response.json()) as { error: string }

    expect(response.status).toBe(502)
    expect(body.error).toContain('/player_api.php')
  })

  it('does not pin a 404 on a single cause', async () => {
    // A portal serving the API perfectly well can still answer 404 — several
    // panels use it for bad credentials instead of returning auth:0. Asserting
    // "this address has no API" sent a real user looking in the wrong place.
    stubFetch(new Response('', { status: 404, statusText: 'Not Found' }))

    const response = await POST(
      request({ host: HOST, username: 'example-user', password: 'not-a-real-password' }),
    )
    const body = (await response.json()) as { error: string }

    expect(body.error).toMatch(/identifiant/i)
    expect(body.error).toMatch(/port/i)
  })

  it('never leaks the password into an error the interface displays', async () => {
    // These messages are rendered on screen and get screenshotted and shared,
    // so the credentials must be masked in every branch that echoes the URL.
    for (const upstream of [
      new Response('', { status: 404, statusText: 'Not Found' }),
      new Response('', { status: 500, statusText: 'Server Error' }),
      new Response('<html>nope</html>', { status: 200 }),
    ]) {
      stubFetch(upstream)
      const response = await POST(
        request({ host: HOST, username: 'example-user', password: 'hunter2-secret' }),
      )
      const body = (await response.json()) as { error: string }

      expect(body.error).not.toContain('hunter2-secret')
      expect(body.error).toContain('***')
      vi.unstubAllGlobals()
    }
  })

  it('reports an upstream HTTP failure as a gateway error', async () => {
    stubFetch(new Response('', { status: 521, statusText: 'Web Server Is Down' }))
    expect((await POST(request({ host: HOST, username: 'a', password: 'b' }))).status).toBe(502)
  })

  it('reports a timeout distinctly from an unreachable host', async () => {
    const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeout))

    const response = await POST(request({ host: HOST, username: 'a', password: 'b' }))
    const body = (await response.json()) as { error: string }

    expect(response.status).toBe(502)
    expect(body.error).toContain('temps')
  })
})
