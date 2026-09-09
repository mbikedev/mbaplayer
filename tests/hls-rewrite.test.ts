import { describe, expect, it } from 'vitest'
import { isHlsPlaylist, rewritePlaylist } from '@/lib/server/hls-rewrite'
import { decodeTarget } from '@/lib/server/safe-fetch'

const BASE = new URL('http://portal.tv:8080/live/alice/pass/42.m3u8')

/** Reads the real upstream URL back out of a rewritten `/api/stream?u=` link. */
function targetOf(line: string): string {
  const encoded = new URL(line, 'http://app.local').searchParams.get('u')
  return decodeTarget(encoded!)
}

describe('rewritePlaylist', () => {
  it('rewrites relative segment URIs against the playlist URL', () => {
    const out = rewritePlaylist(
      ['#EXTM3U', '#EXTINF:10,', 'segment-1.ts', '#EXTINF:10,', 'segment-2.ts'].join('\n'),
      BASE,
    ).split('\n')

    expect(targetOf(out[2])).toBe('http://portal.tv:8080/live/alice/pass/segment-1.ts')
    expect(targetOf(out[4])).toBe('http://portal.tv:8080/live/alice/pass/segment-2.ts')
  })

  it('rewrites absolute segment URIs on another host', () => {
    const out = rewritePlaylist('#EXTINF:10,\nhttp://cdn.other:8080/a/b.ts', BASE).split('\n')
    expect(targetOf(out[1])).toBe('http://cdn.other:8080/a/b.ts')
  })

  it('resolves root-relative URIs against the origin, not the directory', () => {
    const out = rewritePlaylist('#EXTINF:10,\n/hls/seg.ts', BASE).split('\n')
    expect(targetOf(out[1])).toBe('http://portal.tv:8080/hls/seg.ts')
  })

  it('rewrites URI attributes on key, media and map tags', () => {
    const out = rewritePlaylist(
      [
        '#EXT-X-KEY:METHOD=AES-128,URI="key.bin",IV=0x0',
        '#EXT-X-MAP:URI="init.mp4"',
        '#EXT-X-MEDIA:TYPE=AUDIO,NAME="fr",URI="audio/fr.m3u8"',
      ].join('\n'),
      BASE,
    ).split('\n')

    expect(out[0]).toMatch(/^#EXT-X-KEY:METHOD=AES-128,URI="\/api\/stream\?u=.+",IV=0x0$/)
    expect(targetOf(out[0].match(/URI="([^"]+)"/)![1])).toBe(
      'http://portal.tv:8080/live/alice/pass/key.bin',
    )
    expect(targetOf(out[2].match(/URI="([^"]+)"/)![1])).toBe(
      'http://portal.tv:8080/live/alice/pass/audio/fr.m3u8',
    )
  })

  it('leaves tags without a URI untouched', () => {
    const input = '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:10'
    expect(rewritePlaylist(input, BASE)).toBe(input)
  })

  it('preserves blank lines so the playlist stays well formed', () => {
    expect(rewritePlaylist('#EXTM3U\n\nseg.ts', BASE).split('\n')[1]).toBe('')
  })

  it('rewrites variant playlists in a master playlist', () => {
    const out = rewritePlaylist(
      ['#EXTM3U', '#EXT-X-STREAM-INF:BANDWIDTH=800000', '720/index.m3u8'].join('\n'),
      BASE,
    ).split('\n')
    expect(targetOf(out[2])).toBe('http://portal.tv:8080/live/alice/pass/720/index.m3u8')
  })
})

describe('isHlsPlaylist', () => {
  it('recognises every content type portals use for playlists', () => {
    const url = new URL('http://portal.tv/stream')
    expect(isHlsPlaylist(url, 'application/vnd.apple.mpegurl')).toBe(true)
    expect(isHlsPlaylist(url, 'application/x-mpegURL; charset=utf-8')).toBe(true)
    expect(isHlsPlaylist(url, 'audio/x-mpegurl')).toBe(true)
  })

  it('falls back to the path when the content type is wrong', () => {
    expect(isHlsPlaylist(new URL('http://portal.tv/a/42.m3u8'), 'text/plain')).toBe(true)
    expect(isHlsPlaylist(new URL('http://portal.tv/a/42.m3u8?token=x'), '')).toBe(true)
  })

  it('does not treat segments or progressive files as playlists', () => {
    expect(isHlsPlaylist(new URL('http://portal.tv/a/seg.ts'), 'video/mp2t')).toBe(false)
    expect(isHlsPlaylist(new URL('http://portal.tv/a/movie.mp4'), 'video/mp4')).toBe(false)
  })
})
