import { describe, expect, it } from 'vitest'
import {
  decodeEpgText,
  isAuthenticated,
  normalizeAccount,
  normalizeEpg,
  normalizeLiveChannels,
  normalizeMovies,
  normalizeSeriesDetail,
} from '@/lib/xtream-normalize'

describe('isAuthenticated', () => {
  it('accepts auth: 1 as a number or a string', () => {
    expect(isAuthenticated({ user_info: { auth: 1 } })).toBe(true)
    expect(isAuthenticated({ user_info: { auth: '1' } })).toBe(true)
  })

  it('rejects auth: 0 and a missing user_info block', () => {
    expect(isAuthenticated({ user_info: { auth: 0 } })).toBe(false)
    expect(isAuthenticated({})).toBe(false)
  })

  it('falls back to status when the portal omits auth', () => {
    expect(isAuthenticated({ user_info: { status: 'Active' } })).toBe(true)
    expect(isAuthenticated({ user_info: { status: 'Expired' } })).toBe(false)
  })
})

describe('normalizeAccount', () => {
  it('converts second-based timestamps to milliseconds', () => {
    const account = normalizeAccount({
      user_info: { username: 'alice', exp_date: '1767225600', created_at: 1700000000 },
    })
    expect(account.expiresAt).toBe(1767225600000)
    expect(account.createdAt).toBe(1700000000000)
  })

  it('treats a null expiry as unlimited rather than epoch zero', () => {
    expect(normalizeAccount({ user_info: { exp_date: null } }).expiresAt).toBeNull()
    expect(normalizeAccount({ user_info: {} }).expiresAt).toBeNull()
  })

  it('survives a completely empty response', () => {
    const account = normalizeAccount({})
    expect(account.username).toBe('')
    expect(account.status).toBe('Unknown')
    expect(account.allowedFormats).toEqual([])
  })
})

describe('normalizeLiveChannels', () => {
  it('coerces mixed numeric and string ids to strings', () => {
    const channels = normalizeLiveChannels([
      { stream_id: 42, name: 'TV1', category_id: 3, tv_archive: 1 },
      { stream_id: '43', name: 'TV2', category_id: '3', tv_archive: '0' },
    ])
    expect(channels.map((c) => c.id)).toEqual(['42', '43'])
    expect(channels.map((c) => c.categoryId)).toEqual(['3', '3'])
    expect(channels.map((c) => c.hasArchive)).toEqual([true, false])
  })

  it('drops entries with no usable stream id', () => {
    expect(normalizeLiveChannels([{ name: 'Orpheline' }])).toEqual([])
  })

  it('rejects non-http icon values so no broken image is rendered', () => {
    const [channel] = normalizeLiveChannels([
      { stream_id: '1', name: 'TV', stream_icon: 'null' },
    ])
    expect(channel.icon).toBeNull()
  })

  it('returns an empty list when the portal sends a non-array', () => {
    expect(normalizeLiveChannels(null)).toEqual([])
  })
})

describe('normalizeMovies', () => {
  it('prefers the 5-based rating and falls back to the raw one', () => {
    const [withBoth, withRawOnly] = normalizeMovies([
      { stream_id: '1', name: 'A', rating_5based: 4.5, rating: 9 },
      { stream_id: '2', name: 'B', rating: 7.5 },
    ])
    expect(withBoth.rating).toBe(4.5)
    expect(withRawOnly.rating).toBe(7.5)
  })

  it('defaults the container extension to mp4', () => {
    expect(normalizeMovies([{ stream_id: '1', name: 'A' }])[0].extension).toBe('mp4')
  })
})

describe('normalizeSeriesDetail', () => {
  const episodesKeyedBySeason = {
    info: { series_id: '10', name: 'Ma série' },
    seasons: [],
    episodes: {
      '2': [{ id: '201', episode_num: 2, title: 'Deux', container_extension: 'mkv' }],
      '1': [
        { id: '102', episode_num: 2, title: 'Deux' },
        { id: '101', episode_num: 1, title: 'Un' },
      ],
    },
  }

  it('derives the season list when the portal sends seasons: []', () => {
    const detail = normalizeSeriesDetail(episodesKeyedBySeason, '10')!
    expect(detail.seasons.map((s) => s.number)).toEqual([1, 2])
    expect(detail.seasons[0].episodeCount).toBe(2)
  })

  it('sorts episodes by number within a season', () => {
    const detail = normalizeSeriesDetail(episodesKeyedBySeason, '10')!
    expect(detail.episodesBySeason[1].map((e) => e.episodeNum)).toEqual([1, 2])
  })

  it('handles a flat episode array as well as the keyed object', () => {
    const detail = normalizeSeriesDetail(
      {
        info: { series_id: '11', name: 'Autre' },
        episodes: [
          { id: '1', episode_num: 1, season: 1, title: 'Un' },
          { id: '2', episode_num: 1, season: 2, title: 'Un' },
        ],
      },
      '11',
    )!
    expect(Object.keys(detail.episodesBySeason).sort()).toEqual(['1', '2'])
  })

  it('keeps only declared seasons that actually have episodes', () => {
    const detail = normalizeSeriesDetail(
      {
        info: { series_id: '12', name: 'Trous' },
        seasons: [{ season_number: 1 }, { season_number: 2 }, { season_number: 3 }],
        episodes: { '2': [{ id: '1', episode_num: 1 }] },
      },
      '12',
    )!
    expect(detail.seasons.map((s) => s.number)).toEqual([2])
  })
})

describe('decodeEpgText', () => {
  it('decodes the base64 that portals use for EPG titles', () => {
    expect(decodeEpgText(Buffer.from('Journal télévisé', 'utf8').toString('base64'))).toBe(
      'Journal télévisé',
    )
  })

  it('passes plain text through untouched', () => {
    expect(decodeEpgText('Journal télévisé')).toBe('Journal télévisé')
    expect(decodeEpgText('')).toBe('')
  })
})

describe('normalizeEpg', () => {
  it('sorts entries chronologically and converts timestamps', () => {
    const entries = normalizeEpg([
      { id: '2', start_timestamp: 2000, stop_timestamp: 3000, title: 'VGFyZA==' },
      { id: '1', start_timestamp: '1000', stop_timestamp: '2000', now_playing: 1, title: 'VG90' },
    ])
    expect(entries.map((e) => e.id)).toEqual(['1', '2'])
    expect(entries[0].start).toBe(1_000_000)
    expect(entries[0].nowPlaying).toBe(true)
  })

  it('falls back to the date strings when timestamps are missing', () => {
    // No offset is supplied by the portal, so the strings are read as UTC.
    const [entry] = normalizeEpg([
      { id: '1', start: '2026-09-09 20:00:00', end: '2026-09-09 21:30:00' },
    ])
    expect(entry.start).toBe(Date.UTC(2026, 8, 9, 20, 0, 0))
    expect(entry.stop).toBe(Date.UTC(2026, 8, 9, 21, 30, 0))
  })

  it('drops entries with no usable start or end rather than placing them at the epoch', () => {
    expect(
      normalizeEpg([
        { id: '1', title: 'Sans horaire' },
        { id: '2', start: 'pas une date', end: 'non plus' },
        { id: '3', start_timestamp: 1000 },
      ]),
    ).toEqual([])
  })

  it('drops a programme that ends before it starts', () => {
    // A negative duration would render as a negative-width block in the grid.
    expect(
      normalizeEpg([{ id: '1', start_timestamp: 3000, stop_timestamp: 2000 }]),
    ).toEqual([])
  })

  it('drops a zero-length programme', () => {
    expect(
      normalizeEpg([{ id: '1', start_timestamp: 2000, stop_timestamp: 2000 }]),
    ).toEqual([])
  })

  it('prefers the epoch timestamp over the date string when both are present', () => {
    const [entry] = normalizeEpg([
      {
        id: '1',
        start_timestamp: 1_757_440_800,
        stop_timestamp: 1_757_444_400,
        start: '1999-01-01 00:00:00',
        end: '1999-01-01 01:00:00',
      },
    ])
    expect(entry.start).toBe(1_757_440_800_000)
  })
})
