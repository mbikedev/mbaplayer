import { describe, expect, it } from 'vitest'
import { decodableAlternative, qualityOf } from '@/lib/channel-variants'

describe('qualityOf', () => {
  it('separates the channel from its grade', () => {
    expect(qualityOf('|MA| 2M MAROC FHD')).toEqual({ base: '|ma| 2m maroc', tag: 'fhd' })
    expect(qualityOf('|MA| 2M MAROC HD')).toEqual({ base: '|ma| 2m maroc', tag: 'hd' })
    expect(qualityOf('|MA| 2M MAROC')).toEqual({ base: '|ma| 2m maroc', tag: null })
  })

  it('reads the longest tag, not the one inside it', () => {
    expect(qualityOf('TF1 FULL HD')).toEqual({ base: 'tf1', tag: 'full hd' })
  })

  it('accepts the separators resellers put before a tag', () => {
    expect(qualityOf('Canal+ Sport - 4K')).toEqual({ base: 'canal+ sport', tag: '4k' })
    expect(qualityOf('RTBF La Une |HD|')).toEqual({ base: 'rtbf la une', tag: 'hd' })
    expect(qualityOf('M6 (SD)')).toEqual({ base: 'm6', tag: 'sd' })
  })

  it('does not mistake part of a name for a grade', () => {
    expect(qualityOf('Eurosport')).toEqual({ base: 'eurosport', tag: null })
    expect(qualityOf('SD Channel News')).toEqual({ base: 'sd channel news', tag: null })
  })

  it('keeps a name that is nothing but a tag', () => {
    expect(qualityOf('HD')).toEqual({ base: 'hd', tag: null })
  })
})

describe('decodableAlternative', () => {
  const channels = [
    { id: '1', name: '|MA| 2M MAROC' },
    { id: '2', name: '|MA| 2M MAROC HD' },
    { id: '3', name: '|MA| 2M MAROC FHD' },
    { id: '4', name: '|MA| 2M NATIONAL' },
  ]

  it('offers the HD entry when the FHD one fails', () => {
    expect(decodableAlternative(channels[2]!, channels)).toEqual({
      id: '2',
      name: '|MA| 2M MAROC HD',
    })
  })

  it('prefers HD over SD', () => {
    const list = [
      { id: '1', name: 'TF1 SD' },
      { id: '2', name: 'TF1 HD' },
      { id: '3', name: 'TF1 4K' },
    ]
    expect(decodableAlternative(list[2]!, list)?.id).toBe('2')
  })

  it('says nothing when the entry is already a safe tier', () => {
    expect(decodableAlternative(channels[1]!, channels)).toBeNull()
    expect(decodableAlternative(channels[0]!, channels)).toBeNull()
  })

  it('says nothing when the portal carries no other quality', () => {
    const list = [{ id: '1', name: 'Sky Sports UHD' }, { id: '2', name: 'BBC One HD' }]
    expect(decodableAlternative(list[0]!, list)).toBeNull()
  })

  it('never offers another risky tier', () => {
    const list = [
      { id: '1', name: 'Canal+ 4K' },
      { id: '2', name: 'Canal+ FHD' },
    ]
    expect(decodableAlternative(list[0]!, list)).toBeNull()
  })
})
