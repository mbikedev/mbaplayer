import { describe, expect, it } from 'vitest'
import {
  bannerLabel,
  firstPlayable,
  isDecorativeName,
  logoFallback,
} from '@/lib/channel-name'

describe('isDecorativeName', () => {
  it('recognises the banners a live list is padded with', () => {
    const banners = [
      '-----▼|BR| VOD BRAZIL |BR|▼-----',
      '---●★| VOD CRIANCAS |★●---',
      '▼--- |DE| VOD |DE| ---▼',
      '---●★| ZULETZT HINZUGEFÜGT |★●---',
      '▼--- |DE| VOD 4K UHD / 3D |DE| ---▼',
      '-----▼|ES| VOD ESPANOL |ES|▼-----',
      '=== FRANCE ===',
    ]
    for (const name of banners) {
      expect(isDecorativeName(name), name).toBe(true)
    }
  })

  it('leaves real channel names alone', () => {
    const channels = [
      'TF1 FHD',
      '|FR| TF1',
      'RTBF La Une HD',
      'BeIN Sports 1 - 4K',
      'Canal+ Sport',
      'M6',
      'RMC Story +1',
      'SUPER RTL |DE|',
      'A/V Test 3',
    ]
    for (const name of channels) {
      expect(isDecorativeName(name), name).toBe(false)
    }
  })

  it('treats a name with no letters or digits as decorative', () => {
    expect(isDecorativeName('---')).toBe(true)
    expect(isDecorativeName('••••')).toBe(true)
    expect(isDecorativeName('   ')).toBe(true)
    expect(isDecorativeName('')).toBe(true)
  })

  it('needs a rule at both ends, not just one', () => {
    // A reseller's country tag opens many real channel names.
    expect(isDecorativeName('--- TF1')).toBe(false)
    expect(isDecorativeName('TF1 ---')).toBe(false)
  })

  it('ignores surrounding whitespace', () => {
    expect(isDecorativeName('   ---●★| VOD |★●---   ')).toBe(true)
    expect(isDecorativeName('   TF1 HD   ')).toBe(false)
  })
})

describe('firstPlayable', () => {
  it('skips the banners at the head of the list', () => {
    const entries = [
      { name: '-----▼|BR| VOD BRAZIL |BR|▼-----' },
      { name: '---●★| VOD CRIANCAS |★●---' },
      { name: 'TF1 FHD' },
      { name: 'M6' },
    ]
    expect(firstPlayable(entries)).toEqual({ name: 'TF1 FHD' })
  })

  it('falls back to the head when everything looks decorative', () => {
    const entries = [{ name: '--- A ---' }, { name: '--- B ---' }]
    expect(firstPlayable(entries)).toEqual({ name: '--- A ---' })
  })

  it('returns null for an empty list', () => {
    expect(firstPlayable([])).toBeNull()
  })
})

describe('logoFallback', () => {
  it('prefers the channel number when the portal numbers its list', () => {
    expect(logoFallback('M6 FHD', 42)).toBe('42')
  })

  it('falls back to initials when there is no number', () => {
    expect(logoFallback('M6 Music HD', 0)).toBe('MM')
    expect(logoFallback('Canal Plus Sport', null)).toBe('CP')
  })

  it('ignores the reseller tags around the name', () => {
    expect(logoFallback('|FR| M6 FHD', undefined)).toBe('MF')
    expect(logoFallback('(QC) M6 INTERNATIONAL HD (FR)', null)).toBe('MI')
    expect(logoFallback('[4K] Eurosport', null)).toBe('E')
  })

  it('never returns an empty label', () => {
    expect(logoFallback('---', null)).toBe('—')
    expect(logoFallback('', null)).toBe('—')
  })
})

describe('bannerLabel', () => {
  it('keeps the words and drops the frame', () => {
    expect(bannerLabel('-----▼|BR| VOD BRAZIL |BR|▼-----')).toBe('VOD BRAZIL')
    expect(bannerLabel('---●★| VOD CRIANCAS |★●---')).toBe('VOD CRIANCAS')
    expect(bannerLabel('▼--- |DE| VOD |DE| ---▼')).toBe('VOD')
    expect(bannerLabel('=== FRANCE ===')).toBe('FRANCE')
  })

  it('does not split a label on a slash', () => {
    expect(bannerLabel('▼--- |DE| VOD 4K UHD / 3D |DE| ---▼')).toBe('VOD 4K UHD / 3D')
  })

  it('prefers the label over the shorter country tag', () => {
    expect(bannerLabel('-----▼|ES| VOD ESPANOL |ES|▼-----')).toBe('VOD ESPANOL')
    expect(bannerLabel('---●★| ZULETZT HINZUGEFÜGT |★●---')).toBe('ZULETZT HINZUGEFÜGT')
  })

  it('collapses the whitespace the frame leaves behind', () => {
    expect(bannerLabel('▼●★ ---  |FR|  M6 PLAY  |FR| --- ★●▼')).toBe('M6 PLAY')
  })

  it('returns the name when there is nothing but frame', () => {
    expect(bannerLabel('-----')).toBe('-----')
  })
})
