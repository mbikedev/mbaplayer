import { describe, expect, it } from 'vitest'
import { assertFetchableUrl, decodeTarget, encodeTarget } from '@/lib/server/safe-fetch'

/**
 * The proxy routes fetch a URL supplied by the client, so these are the tests
 * that keep that from becoming a server-side request forgery hole.
 */
describe('assertFetchableUrl', () => {
  it('rejects non-http schemes', async () => {
    await expect(assertFetchableUrl('file:///etc/passwd')).rejects.toThrow()
    await expect(assertFetchableUrl('ftp://host/x')).rejects.toThrow()
    await expect(assertFetchableUrl('not a url')).rejects.toThrow()
  })

  it('rejects loopback and localhost', async () => {
    await expect(assertFetchableUrl('http://127.0.0.1:8080/x')).rejects.toThrow()
    await expect(assertFetchableUrl('http://localhost:3000/x')).rejects.toThrow()
    await expect(assertFetchableUrl('http://[::1]/x')).rejects.toThrow()
  })

  it('rejects private IPv4 ranges', async () => {
    for (const host of ['10.0.0.1', '172.16.0.1', '192.168.1.1', '100.64.0.1', '0.0.0.0']) {
      await expect(assertFetchableUrl(`http://${host}/x`)).rejects.toThrow()
    }
  })

  it('rejects the cloud metadata endpoint even by IP', async () => {
    await expect(assertFetchableUrl('http://169.254.169.254/latest/meta-data/')).rejects.toThrow()
    await expect(assertFetchableUrl('http://metadata.google.internal/x')).rejects.toThrow()
  })

  it('rejects IPv6 unique-local and link-local addresses', async () => {
    await expect(assertFetchableUrl('http://[fd00::1]/x')).rejects.toThrow()
    await expect(assertFetchableUrl('http://[fe80::1]/x')).rejects.toThrow()
  })

  it('rejects IPv6 forms that embed or translate to a private IPv4 address', async () => {
    // The URL parser rewrites this to its hex form (::ffff:7f00:1) before the
    // guard ever sees it, which is exactly how a mapped loopback slips past a
    // check written against the dotted spelling.
    await expect(assertFetchableUrl('http://[::ffff:127.0.0.1]/x')).rejects.toThrow()
    await expect(assertFetchableUrl('http://[::ffff:7f00:1]/x')).rejects.toThrow()
    await expect(assertFetchableUrl('http://[::ffff:a00:1]/x')).rejects.toThrow()
    await expect(assertFetchableUrl('http://[64:ff9b::7f00:1]/x')).rejects.toThrow()
    await expect(assertFetchableUrl('http://[2002:7f00:1::]/x')).rejects.toThrow()
  })

  it('rejects the whole fe80::/10 link-local range, not just fe80', async () => {
    await expect(assertFetchableUrl('http://[feb0::1]/x')).rejects.toThrow()
  })

  it('allows a public IP literal', async () => {
    const url = await assertFetchableUrl('http://93.184.216.34:8080/player_api.php')
    expect(url.hostname).toBe('93.184.216.34')
  })

  it('rejects a hostname that does not resolve', async () => {
    await expect(
      assertFetchableUrl('http://portail-qui-nexiste-pas.invalid/x'),
    ).rejects.toThrow()
  })
})

describe('encodeTarget / decodeTarget', () => {
  it('round-trips a URL with query parameters and accents', () => {
    const url = 'http://p.tv:8080/live/a b/p?w=1&x=é'
    expect(decodeTarget(encodeTarget(url))).toBe(url)
  })

  it('produces a value that is safe inside a query string', () => {
    expect(encodeTarget('http://p.tv/a?b=c&d=e')).not.toMatch(/[+/=]/)
  })
})
