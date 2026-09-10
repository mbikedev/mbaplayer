import { describe, expect, it } from 'vitest'
import { decodeXmlText, parseXmltv, parseXmltvDate, xmltvChannelIds } from '@/lib/xmltv'

const GUIDE = `<?xml version="1.0" encoding="UTF-8"?>
<tv generator-info-name="test">
  <channel id="TF1.fr"><display-name>TF1</display-name></channel>
  <channel id="France2.fr"><display-name>France 2</display-name></channel>
  <programme start="20260909200000 +0200" stop="20260909213000 +0200" channel="TF1.fr">
    <title lang="fr">Journal</title>
    <desc lang="fr">L&apos;actualit&#233; du soir.</desc>
  </programme>
  <programme start="20260909213000 +0200" stop="20260909230000 +0200" channel="TF1.fr">
    <title lang="fr">Cin&#xE9;ma</title>
  </programme>
  <programme start="20260909200000 +0200" stop="20260909210000 +0200" channel="France2.fr">
    <title lang="fr">Autre cha&#238;ne</title>
  </programme>
</tv>`

describe('parseXmltvDate', () => {
  it('honours the offset a guide publishes', () => {
    // 20:00 in UTC+2 is 18:00 UTC. Dropping the offset would shift the whole
    // grid for anyone watching from another timezone.
    expect(parseXmltvDate('20260909200000 +0200')).toBe(Date.UTC(2026, 8, 9, 18, 0, 0))
    expect(parseXmltvDate('20260909200000 -0500')).toBe(Date.UTC(2026, 8, 10, 1, 0, 0))
  })

  it('reads a timestamp with no offset as UTC', () => {
    expect(parseXmltvDate('20260909200000')).toBe(Date.UTC(2026, 8, 9, 20, 0, 0))
  })

  it('tolerates a missing seconds field and surrounding space', () => {
    expect(parseXmltvDate('  202609092000 +0000  ')).toBe(Date.UTC(2026, 8, 9, 20, 0, 0))
  })

  it('returns null for anything it cannot read', () => {
    expect(parseXmltvDate('')).toBeNull()
    expect(parseXmltvDate('demain soir')).toBeNull()
    expect(parseXmltvDate('2026-09-09T20:00:00Z')).toBeNull()
  })
})

describe('decodeXmlText', () => {
  it('resolves named, decimal and hex entities', () => {
    expect(decodeXmlText('L&apos;actualit&#233; &amp; le sport &#xE9;')).toBe(
      "L'actualité & le sport é",
    )
  })

  it('unwraps CDATA', () => {
    expect(decodeXmlText('<![CDATA[Un <résumé> brut]]>')).toBe('Un <résumé> brut')
  })

  it('leaves an unknown entity alone rather than mangling it', () => {
    expect(decodeXmlText('100&euro; &inconnu;')).toBe('100&euro; &inconnu;')
  })
})

describe('parseXmltv', () => {
  it('groups programmes by channel, in order', () => {
    const guide = parseXmltv(GUIDE)
    expect([...guide.keys()].sort()).toEqual(['France2.fr', 'TF1.fr'])
    expect(guide.get('TF1.fr')!.map((e) => e.title)).toEqual(['Journal', 'Cinéma'])
  })

  it('converts times through the declared offset', () => {
    const [first] = parseXmltv(GUIDE).get('TF1.fr')!
    expect(first.start).toBe(Date.UTC(2026, 8, 9, 18, 0, 0))
    expect(first.stop).toBe(Date.UTC(2026, 8, 9, 19, 30, 0))
  })

  it('decodes titles and descriptions', () => {
    const [first] = parseXmltv(GUIDE).get('TF1.fr')!
    expect(first.description).toBe("L'actualité du soir.")
  })

  it('keeps only the requested channels', () => {
    // A guide covers the provider's whole line-up, which is far more than one
    // playlist carries; holding the rest in memory serves nobody.
    const guide = parseXmltv(GUIDE, { channelIds: new Set(['TF1.fr']) })
    expect([...guide.keys()]).toEqual(['TF1.fr'])
  })

  it('never claims catch-up, which a guide cannot describe', () => {
    expect(parseXmltv(GUIDE).get('TF1.fr')!.every((e) => !e.hasArchive)).toBe(true)
  })

  it('names an untitled programme rather than leaving a blank block', () => {
    const guide = parseXmltv(
      '<programme start="20260909200000" stop="20260909210000" channel="A"></programme>',
    )
    expect(guide.get('A')![0].title).toBe('Sans titre')
  })

  it('drops programmes with unusable or inverted times', () => {
    const guide = parseXmltv(
      [
        '<programme start="pas une date" stop="20260909210000" channel="A"><title>X</title></programme>',
        '<programme start="20260909210000" stop="20260909200000" channel="A"><title>Y</title></programme>',
        '<programme start="20260909200000" stop="20260909200000" channel="A"><title>Z</title></programme>',
      ].join('\n'),
    )
    expect(guide.size).toBe(0)
  })

  it('ignores a programme with no channel attribute', () => {
    expect(
      parseXmltv('<programme start="20260909200000" stop="20260909210000"><title>X</title></programme>')
        .size,
    ).toBe(0)
  })

  it('reads attributes in any order and with single quotes', () => {
    const guide = parseXmltv(
      "<programme channel='A' stop=\"20260909210000\" start='20260909200000'><title>X</title></programme>",
    )
    expect(guide.get('A')![0].title).toBe('X')
  })

  it('returns nothing for an empty or non-XMLTV body', () => {
    expect(parseXmltv('').size).toBe(0)
    expect(parseXmltv('<html><body>404</body></html>').size).toBe(0)
  })

  it('handles a large guide without losing programmes', () => {
    const blocks = ['<tv>']
    for (let i = 0; i < 4000; i += 1) {
      const hour = String(i % 24).padStart(2, '0')
      blocks.push(
        `<programme start="202609${String((i % 28) + 1).padStart(2, '0')}${hour}0000 +0000" ` +
          `stop="202609${String((i % 28) + 1).padStart(2, '0')}${hour}3000 +0000" ` +
          `channel="C${i % 50}"><title>P${i}</title></programme>`,
      )
    }
    blocks.push('</tv>')
    const guide = parseXmltv(blocks.join('\n'))
    expect(guide.size).toBe(50)
    expect([...guide.values()].reduce((n, list) => n + list.length, 0)).toBe(4000)
  })
})

describe('xmltvChannelIds', () => {
  it('lists the channels a guide declares', () => {
    expect([...xmltvChannelIds(GUIDE)].sort()).toEqual(['France2.fr', 'TF1.fr'])
  })
})
