import { describe, expect, it } from 'vitest'
import {
  buildCatalog,
  classifyEntry,
  entryExtension,
  entryId,
  parseEpisodeName,
  parseM3u,
  type M3uEntry,
} from '@/lib/m3u'

function entry(patch: Partial<M3uEntry> = {}): M3uEntry {
  return {
    name: 'Chaîne',
    url: 'http://p.tv:8080/live/user/pass/1.ts',
    tvgId: null,
    tvgName: null,
    logo: null,
    group: null,
    ...patch,
  }
}

describe('parseM3u', () => {
  it('reads attributes and the display name from an #EXTINF line', () => {
    const { entries } = parseM3u(
      [
        '#EXTM3U',
        '#EXTINF:-1 tvg-id="TF1.fr" tvg-name="TF1" tvg-logo="http://cdn/tf1.png" group-title="FR| TNT",TF1 HD',
        'http://p.tv:8080/live/u/p/101.ts',
      ].join('\n'),
    )

    expect(entries).toHaveLength(1)
    expect(entries[0]).toEqual({
      name: 'TF1 HD',
      url: 'http://p.tv:8080/live/u/p/101.ts',
      tvgId: 'TF1.fr',
      tvgName: 'TF1',
      logo: 'http://cdn/tf1.png',
      group: 'FR| TNT',
    })
  })

  it('keeps commas that belong to the display name', () => {
    // The name is everything after the last comma that follows the attributes,
    // and titles routinely contain commas of their own.
    const { entries } = parseM3u(
      ['#EXTINF:-1 group-title="VOD",Manger, prier, aimer', 'http://p.tv/movie/u/p/9.mp4'].join('\n'),
    )
    expect(entries[0].name).toBe('Manger, prier, aimer')
  })

  it('picks up the EPG url from the header', () => {
    expect(
      parseM3u('#EXTM3U x-tvg-url="http://p.tv/xmltv.php?username=u"\n').epgUrl,
    ).toBe('http://p.tv/xmltv.php?username=u')
    expect(parseM3u('#EXTM3U url-tvg="http://p.tv/epg.xml"\n').epgUrl).toBe('http://p.tv/epg.xml')
    expect(parseM3u('#EXTM3U\n').epgUrl).toBeNull()
  })

  it('tolerates CRLF, blank lines and unrelated directives', () => {
    const { entries } = parseM3u(
      [
        '#EXTM3U',
        '',
        '#EXTINF:-1,Une',
        '#EXTGRP:Généralistes',
        '#EXTVLCOPT:http-user-agent=VLC',
        'http://p.tv/live/u/p/1.ts',
        '',
        '#EXTINF:-1,Deux',
        'http://p.tv/live/u/p/2.ts',
      ].join('\r\n'),
    )
    expect(entries.map((e) => e.name)).toEqual(['Une', 'Deux'])
  })

  it('drops an #EXTINF with no URL after it without losing the rest', () => {
    const { entries } = parseM3u(
      ['#EXTINF:-1,Orpheline', '#EXTINF:-1,Valide', 'http://p.tv/live/u/p/2.ts'].join('\n'),
    )
    expect(entries.map((e) => e.name)).toEqual(['Valide'])
  })

  it('rejects placeholder logo values instead of rendering a broken image', () => {
    const { entries } = parseM3u(
      ['#EXTINF:-1 tvg-logo="null",A', 'http://p.tv/live/u/p/1.ts'].join('\n'),
    )
    expect(entries[0].logo).toBeNull()
  })

  it('falls back to tvg-name when there is no text after the comma', () => {
    const { entries } = parseM3u(
      ['#EXTINF:-1 tvg-name="Repli",', 'http://p.tv/live/u/p/1.ts'].join('\n'),
    )
    expect(entries[0].name).toBe('Repli')
  })

  it('returns nothing for an empty or non-playlist body', () => {
    expect(parseM3u('').entries).toEqual([])
    expect(parseM3u('<html>404</html>').entries).toEqual([])
  })
})

describe('classifyEntry', () => {
  it('trusts the Xtream URL path above everything else', () => {
    expect(classifyEntry(entry({ url: 'http://p.tv/live/u/p/1.ts' }))).toBe('live')
    expect(classifyEntry(entry({ url: 'http://p.tv/movie/u/p/1.mp4' }))).toBe('movie')
    expect(classifyEntry(entry({ url: 'http://p.tv/series/u/p/1.mkv' }))).toBe('series')
    // Even when the group name says otherwise.
    expect(classifyEntry(entry({ url: 'http://p.tv/live/u/p/1.ts', group: 'VOD' }))).toBe('live')
  })

  it('falls back to the group name for playlists that are not Xtream-shaped', () => {
    expect(classifyEntry(entry({ url: 'http://cdn/x.m3u8', group: 'FILMS | ACTION' }))).toBe('movie')
    expect(classifyEntry(entry({ url: 'http://cdn/x.m3u8', group: 'SÉRIES VF' }))).toBe('series')
    expect(classifyEntry(entry({ url: 'http://cdn/x.m3u8', group: 'FR | TNT' }))).toBe('live')
  })

  it('reads a video container as on-demand, and a stream format as live', () => {
    expect(classifyEntry(entry({ url: 'http://cdn/film.mp4', group: null }))).toBe('movie')
    expect(classifyEntry(entry({ url: 'http://cdn/x.m3u8', group: null }))).toBe('live')
    expect(classifyEntry(entry({ url: 'http://cdn/x.ts', group: null }))).toBe('live')
  })

  it('sends a container file with an episode marker to series', () => {
    expect(classifyEntry(entry({ name: 'Kaamelott S02 E14', url: 'http://cdn/k.mkv' }))).toBe(
      'series',
    )
  })
})

describe('entryId', () => {
  it('reuses the Xtream stream id so ids match the API mode', () => {
    expect(entryId(entry({ url: 'http://p.tv/live/u/p/12345.ts' }))).toBe('12345')
    expect(entryId(entry({ url: 'http://p.tv/movie/u/p/678.mp4' }))).toBe('678')
  })

  it('hashes any other URL, stably', () => {
    const a = entryId(entry({ url: 'http://cdn/stream/abc.m3u8' }))
    const b = entryId(entry({ url: 'http://cdn/stream/abc.m3u8' }))
    expect(a).toBe(b)
    expect(a).not.toBe(entryId(entry({ url: 'http://cdn/stream/xyz.m3u8' })))
  })
})

describe('entryExtension', () => {
  it('takes the container from the URL', () => {
    expect(entryExtension(entry({ url: 'http://p.tv/movie/u/p/1.mkv' }), 'movie')).toBe('mkv')
  })

  it('defaults by kind when the URL has none', () => {
    expect(entryExtension(entry({ url: 'http://cdn/stream' }), 'live')).toBe('m3u8')
    expect(entryExtension(entry({ url: 'http://cdn/stream' }), 'movie')).toBe('mp4')
  })
})

describe('parseEpisodeName', () => {
  it('reads the common episode spellings', () => {
    expect(parseEpisodeName('Breaking Bad S01 E03')).toEqual({
      show: 'Breaking Bad',
      season: 1,
      episode: 3,
    })
    expect(parseEpisodeName('Breaking Bad S01E03')).toEqual({
      show: 'Breaking Bad',
      season: 1,
      episode: 3,
    })
    expect(parseEpisodeName('Kaamelott 2x14')).toEqual({ show: 'Kaamelott', season: 2, episode: 14 })
    expect(parseEpisodeName('Dix Pour Cent Season 3 Episode 6')).toEqual({
      show: 'Dix Pour Cent',
      season: 3,
      episode: 6,
    })
  })

  it('keeps trailing text out of the show name', () => {
    expect(parseEpisodeName('Engrenages S05 E02 VF HD')?.show).toBe('Engrenages')
  })

  it('returns null when there is no episode marker', () => {
    expect(parseEpisodeName('Les Nuits fauves')).toBeNull()
    expect(parseEpisodeName('Match TF1 2024')).toBeNull()
  })
})

describe('buildCatalog', () => {
  const playlist = parseM3u(
    [
      '#EXTM3U x-tvg-url="http://p.tv/xmltv.php"',
      '#EXTINF:-1 tvg-id="TF1.fr" tvg-logo="http://cdn/tf1.png" group-title="FR| TNT",TF1 HD',
      'http://p.tv:8080/live/u/p/101.ts',
      '#EXTINF:-1 group-title="FR| TNT",France 2',
      'http://p.tv:8080/live/u/p/102.ts',
      '#EXTINF:-1 group-title="VOD| DRAME",Les Nuits fauves',
      'http://p.tv:8080/movie/u/p/900.mp4',
      '#EXTINF:-1 group-title="SÉRIES| FR",Engrenages S01 E02',
      'http://p.tv:8080/series/u/p/501.mkv',
      '#EXTINF:-1 group-title="SÉRIES| FR",Engrenages S01 E01',
      'http://p.tv:8080/series/u/p/500.mkv',
      '#EXTINF:-1 group-title="SÉRIES| FR",Engrenages S02 E01',
      'http://p.tv:8080/series/u/p/510.mkv',
    ].join('\n'),
  )
  const catalog = buildCatalog(playlist)

  it('splits the flat list into the three catalogues', () => {
    expect(catalog.live.map((c) => c.name)).toEqual(['TF1 HD', 'France 2'])
    expect(catalog.movies.map((m) => m.name)).toEqual(['Les Nuits fauves'])
    expect(catalog.series.map((s) => s.name)).toEqual(['Engrenages'])
  })

  it('derives categories from group-title', () => {
    expect(catalog.liveCategories.map((c) => c.name)).toEqual(['FR| TNT'])
    expect(catalog.movieCategories.map((c) => c.name)).toEqual(['VOD| DRAME'])
    expect(catalog.live.every((c) => c.categoryId === catalog.liveCategories[0].id)).toBe(true)
  })

  it('groups episodes into seasons and orders them', () => {
    const detail = catalog.seriesDetail.get(catalog.series[0].id)!
    expect(detail.seasons.map((s) => s.number)).toEqual([1, 2])
    expect(detail.episodesBySeason[1].map((e) => e.episodeNum)).toEqual([1, 2])
    expect(detail.seasons[0].episodeCount).toBe(2)
  })

  it('maps every item back to its playlist URL', () => {
    expect(catalog.urlByKey.get('live:101')).toBe('http://p.tv:8080/live/u/p/101.ts')
    expect(catalog.urlByKey.get('movie:900')).toBe('http://p.tv:8080/movie/u/p/900.mp4')
    expect(catalog.urlByKey.get('series:500')).toBe('http://p.tv:8080/series/u/p/500.mkv')
  })

  it('never claims catch-up, which a playlist cannot describe', () => {
    expect(catalog.live.every((c) => !c.hasArchive && c.archiveDays === 0)).toBe(true)
  })

  it('carries the EPG url through', () => {
    expect(catalog.epgUrl).toBe('http://p.tv/xmltv.php')
  })

  it('lists an ungrouped entry under a named fallback category', () => {
    const built = buildCatalog(parseM3u('#EXTINF:-1,Sans groupe\nhttp://p.tv/live/u/p/1.ts'))
    expect(built.liveCategories[0].name).toBe('Sans catégorie')
  })

  it('treats a /series/ URL with no episode marker as a film', () => {
    // Rather than inventing a one-episode series with a meaningless name.
    const built = buildCatalog(parseM3u('#EXTINF:-1,Documentaire\nhttp://p.tv/series/u/p/1.mkv'))
    expect(built.series).toEqual([])
    expect(built.movies.map((m) => m.name)).toEqual(['Documentaire'])
  })

  it('handles a large playlist without losing entries', () => {
    const lines = ['#EXTM3U']
    for (let i = 0; i < 5000; i += 1) {
      lines.push(`#EXTINF:-1 group-title="G${i % 20}",Chaîne ${i}`)
      lines.push(`http://p.tv:8080/live/u/p/${i}.ts`)
    }
    const built = buildCatalog(parseM3u(lines.join('\n')))
    expect(built.live).toHaveLength(5000)
    expect(built.liveCategories).toHaveLength(20)
  })
})
