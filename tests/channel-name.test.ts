import { describe, expect, it } from 'vitest'
import { firstPlayable, isDecorativeName } from '@/lib/channel-name'

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
