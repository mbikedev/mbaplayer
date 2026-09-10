import { gzipSync } from 'node:zlib'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/xmltv/route'

/**
 * Integration tests for the guide proxy. A public IP literal keeps the SSRF
 * guard happy without touching DNS, and `fetch` is stubbed so nothing leaves
 * the process.
 */

const GUIDE_URL = 'http://93.184.216.34:8080/xmltv.php?username=example-user&password=secret-value'

const GUIDE = `<?xml version="1.0"?>
<tv><programme start="20260909200000 +0200" stop="20260909210000 +0200" channel="A">
<title>Journal</title></programme></tv>`

function request(url: unknown): Request {
  return new Request('http://app.local/api/xmltv', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url }),
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

describe('POST /api/xmltv', () => {
  it('returns a plain guide as XML', async () => {
    stubFetch(new Response(GUIDE))

    const response = await POST(request(GUIDE_URL))

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('xml')
    expect(await response.text()).toContain('<programme')
  })

  it('decompresses a gzipped guide served as a plain file', async () => {
    // `fetch` unwraps Content-Encoding on its own, but a .xml.gz carries no
    // such header — the bytes themselves are the only reliable signal, and
    // providers serve both forms more or less at random.
    const gzipped = gzipSync(Buffer.from(GUIDE, 'utf8'))
    stubFetch(new Response(gzipped, { headers: { 'content-type': 'application/gzip' } }))

    const response = await POST(request(GUIDE_URL))

    expect(response.status).toBe(200)
    expect(await response.text()).toContain('<programme')
  })

  it('reports a corrupt compressed guide rather than serving garbage', async () => {
    const truncated = gzipSync(Buffer.from(GUIDE, 'utf8')).subarray(0, 12)
    stubFetch(new Response(truncated))

    const response = await POST(request(GUIDE_URL))
    const body = (await response.json()) as { error: string }

    expect(response.status).toBe(502)
    expect(body.error).toMatch(/compress/i)
  })

  it('rejects a body that is not a guide, whatever the status says', async () => {
    stubFetch(new Response('<html><body>Access denied</body></html>'))

    const response = await POST(request(GUIDE_URL))
    const body = (await response.json()) as { error: string }

    expect(response.status).toBe(502)
    expect(body.error).toContain('XMLTV')
  })

  it('masks the credentials in every error it reports', async () => {
    // The guide URL carries the account, exactly like a playlist URL does.
    stubFetch(new Response('<html>nope</html>'))

    const body = (await (await POST(request(GUIDE_URL))).json()) as { error: string }

    expect(body.error).not.toContain('secret-value')
    expect(body.error).toContain('***')
  })

  it('refuses a target the SSRF guard rejects, before any request', async () => {
    const spy = stubFetch(new Response(GUIDE))

    const response = await POST(request('http://127.0.0.1:8080/xmltv.php'))

    expect(response.status).toBe(400)
    expect(spy).not.toHaveBeenCalled()
  })

  it('rejects a missing or non-string url', async () => {
    expect((await POST(request(undefined))).status).toBe(400)
    expect((await POST(request(42))).status).toBe(400)
  })

  it('reports an upstream failure as a gateway error', async () => {
    stubFetch(new Response('', { status: 403, statusText: 'Forbidden' }))
    expect((await POST(request(GUIDE_URL))).status).toBe(502)
  })

  it('reports a timeout distinctly, since full guides are slow to generate', async () => {
    const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeout))

    const body = (await (await POST(request(GUIDE_URL))).json()) as { error: string }

    expect(body.error).toContain('temps')
  })
})
