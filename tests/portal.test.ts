import { describe, expect, it } from 'vitest'
import { buildStreamUrl, liveStreamCandidates, parsePortalInput, playerApiUrl } from '@/lib/portal'

describe('parsePortalInput', () => {
  it('adds the default scheme to a bare host', () => {
    expect(parsePortalInput('mon-portail.tv:8080').host).toBe('http://mon-portail.tv:8080')
  })

  it('keeps an explicit https scheme and port', () => {
    expect(parsePortalInput('https://mon-portail.tv:2096/').host).toBe('https://mon-portail.tv:2096')
  })

  it('strips the API entrypoint from the path', () => {
    expect(parsePortalInput('http://p.tv:8080/player_api.php').host).toBe('http://p.tv:8080')
    expect(parsePortalInput('http://p.tv:8080/c/').host).toBe('http://p.tv:8080')
    expect(parsePortalInput('http://p.tv:8080/panel_api.php').host).toBe('http://p.tv:8080')
  })

  it('drops a port that is the default for the scheme', () => {
    // URL normalisation, and harmless: the request goes to the same place.
    expect(parsePortalInput('http://p.tv:80/player_api.php').host).toBe('http://p.tv')
    expect(parsePortalInput('https://p.tv:443/').host).toBe('https://p.tv')
  })

  it('keeps a directory prefix the portal is mounted under', () => {
    expect(parsePortalInput('http://p.tv/iptv/player_api.php').host).toBe('http://p.tv/iptv')
  })

  it('extracts credentials from a get.php playlist URL', () => {
    const parsed = parsePortalInput(
      'http://p.tv:8080/get.php?username=example-user&password=not-a-real-password&type=m3u_plus&output=ts',
    )
    expect(parsed).toEqual({ host: 'http://p.tv:8080', username: 'example-user', password: 'not-a-real-password' })
  })

  it('rejects empty and non-http input', () => {
    expect(() => parsePortalInput('   ')).toThrow()
    expect(() => parsePortalInput('ftp://p.tv')).toThrow()
  })
})

describe('playerApiUrl', () => {
  it('drops empty parameters so a bare auth call has no action', () => {
    const url = playerApiUrl('http://p.tv:8080/', { username: 'a', password: 'b', action: '' })
    expect(url).toBe('http://p.tv:8080/player_api.php?username=a&password=b')
  })

  it('tolerates a trailing slash on the stored host', () => {
    expect(playerApiUrl('http://p.tv//', { username: 'a', password: 'b' })).toContain(
      'http://p.tv/player_api.php',
    )
  })
})

describe('buildStreamUrl', () => {
  const base = { host: 'http://p.tv:8080', username: 'example-user', password: 'not-a-real-password' }

  it('routes each content kind to its own path segment', () => {
    expect(buildStreamUrl({ ...base, kind: 'live', streamId: '42', extension: 'm3u8' })).toBe(
      'http://p.tv:8080/live/example-user/not-a-real-password/42.m3u8',
    )
    expect(buildStreamUrl({ ...base, kind: 'movie', streamId: '7', extension: 'mkv' })).toBe(
      'http://p.tv:8080/movie/example-user/not-a-real-password/7.mkv',
    )
    expect(buildStreamUrl({ ...base, kind: 'series', streamId: '9', extension: 'mp4' })).toBe(
      'http://p.tv:8080/series/example-user/not-a-real-password/9.mp4',
    )
  })

  it('percent-encodes credentials containing URL-significant characters', () => {
    const url = buildStreamUrl({
      host: 'http://p.tv',
      username: 'a b',
      password: 'p/w?x',
      kind: 'movie',
      streamId: '1',
      extension: 'mp4',
    })
    expect(url).toBe('http://p.tv/movie/a%20b/p%2Fw%3Fx/1.mp4')
  })

  it('normalises a leading dot on the container extension', () => {
    expect(
      buildStreamUrl({ ...base, kind: 'movie', streamId: '1', extension: '.mp4' }),
    ).toMatch(/1\.mp4$/)
  })

  it('offers the legacy root-level form as a live fallback', () => {
    expect(liveStreamCandidates({ ...base, streamId: '42', extension: 'm3u8' })).toEqual([
      'http://p.tv:8080/live/example-user/not-a-real-password/42.m3u8',
      'http://p.tv:8080/example-user/not-a-real-password/42.m3u8',
    ])
  })
})
