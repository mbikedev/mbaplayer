import type { EpgEntry } from './xtream-types'

/**
 * XMLTV parsing, for playlist mode.
 *
 * A playlist carries no guide of its own — at best it declares an `x-tvg-url`
 * pointing at an XMLTV document, which is what this reads.
 *
 * It is parsed by scanning for `<programme>` blocks rather than through a DOM.
 * That is a deliberate trade: XMLTV is machine-generated with a rigidly regular
 * shape, and these documents routinely run to tens of megabytes — building a
 * full DOM for one costs far more memory than the guide is worth. The cost of
 * the trade is that genuinely malformed XML is not detected, only skipped.
 */

/** `<programme start="..." stop="..." channel="...">…</programme>` */
const PROGRAMME_PATTERN = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/gi

/** Attribute in a start tag: name="value" or name='value'. */
const ATTRIBUTE_PATTERN = /([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g

function attributes(tag: string): Record<string, string> {
  const found: Record<string, string> = {}
  for (const match of tag.matchAll(ATTRIBUTE_PATTERN)) {
    found[match[1].toLowerCase()] = match[3] ?? match[4] ?? ''
  }
  return found
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

/** Resolves the entities and numeric references XMLTV text carries. */
export function decodeXmlText(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => codePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => codePoint(Number(dec)))
    .replace(/&(\w+);/g, (whole, name: string) => ENTITIES[name.toLowerCase()] ?? whole)
    .trim()
}

function codePoint(value: number): string {
  return Number.isFinite(value) && value >= 0 && value <= 0x10ffff ? String.fromCodePoint(value) : ''
}

/**
 * Reads the first `<tag>` inside a programme block.
 *
 * Guides repeat a tag once per language; the first is taken rather than trying
 * to match the viewer's locale, because the language a provider lists first is
 * in practice the one its audience reads.
 */
function firstTag(body: string, tag: string): string {
  const match = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(body)
  return match ? decodeXmlText(match[1]) : ''
}

/**
 * Parses an XMLTV timestamp: `20260909200000 +0200`, or without the offset.
 *
 * The offset matters and is honoured: a guide is published in the broadcaster's
 * timezone, and dropping it would shift the whole grid for anyone watching from
 * elsewhere. When none is given the value is read as UTC, which is the only
 * defensible reading — and is recorded here as a known source of skew.
 */
export function parseXmltvDate(value: string): number | null {
  const match = /^\s*(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*(?:([+-])(\d{2})(\d{2}))?\s*$/.exec(
    value,
  )
  if (!match) return null

  const [, year, month, day, hour, minute, second, sign, offsetHours, offsetMinutes] = match
  const utc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second ?? '0'),
  )
  if (!Number.isFinite(utc)) return null

  if (!sign) return utc

  const offsetMs = (Number(offsetHours) * 60 + Number(offsetMinutes)) * 60_000
  return sign === '+' ? utc - offsetMs : utc + offsetMs
}

export interface XmltvOptions {
  /**
   * Channel ids worth keeping. A guide covers the provider's whole line-up,
   * which is routinely far more than one playlist carries, and holding the rest
   * in memory serves nobody. Omit to keep everything.
   */
  channelIds?: ReadonlySet<string>
}

/**
 * Programmes by channel id, each list ordered by start time.
 *
 * The ids are XMLTV's `channel` attribute, which is what a playlist's `tvg-id`
 * joins on.
 */
export function parseXmltv(
  document: string,
  options: XmltvOptions = {},
): Map<string, EpgEntry[]> {
  const wanted = options.channelIds
  const byChannel = new Map<string, EpgEntry[]>()
  let index = 0

  for (const match of document.matchAll(PROGRAMME_PATTERN)) {
    const attrs = attributes(match[1])
    const channelId = attrs.channel?.trim()
    if (!channelId) continue
    if (wanted && !wanted.has(channelId)) continue

    const start = parseXmltvDate(attrs.start ?? '')
    const stop = parseXmltvDate(attrs.stop ?? '')
    // A programme with no usable times cannot be placed on a grid, and one that
    // ends before it starts would render as a negative-width block.
    if (start === null || stop === null || stop <= start) continue

    const body = match[2]
    const entry: EpgEntry = {
      id: `x${index++}`,
      title: firstTag(body, 'title') || 'Sans titre',
      description: firstTag(body, 'desc'),
      start,
      stop,
      nowPlaying: false,
      // XMLTV describes what was broadcast, never whether the portal kept a
      // recording of it.
      hasArchive: false,
    }

    const list = byChannel.get(channelId)
    if (list) list.push(entry)
    else byChannel.set(channelId, [entry])
  }

  for (const list of byChannel.values()) {
    list.sort((a, b) => a.start - b.start)
  }

  return byChannel
}

/** The channel ids a guide document declares, for diagnostics. */
export function xmltvChannelIds(document: string): Set<string> {
  const ids = new Set<string>()
  for (const match of document.matchAll(/<channel\b([^>]*)>/gi)) {
    const id = attributes(match[1]).id?.trim()
    if (id) ids.add(id)
  }
  return ids
}
