/**
 * Matching a channel to the other qualities the same portal carries.
 *
 * Resellers publish one entry per quality — `|MA| 2M MAROC`, `… HD`, `… FHD` —
 * and the top tiers are routinely H.265. Chrome cannot decode H.265 out of
 * MPEG-TS through hls.js, so the FHD entry fails while the HD one right below
 * it plays. The list holds the answer; the viewer just has to be told.
 */

/** The quality suffixes resellers append. Recognition only — see FALLBACK_RANK for order. */
const QUALITY_TAGS = ['sd', 'hd', 'fhd', 'full hd', 'uhd', '4k', '2k', '8k', 'h265', 'hevc'] as const

/** Tiers that are commonly H.265 and so pointless to fall back to. */
const RISKY_TAGS = new Set(['fhd', 'full hd', 'uhd', '4k', '2k', '8k', 'h265', 'hevc'])

/** Longest first, so `FULL HD` is not read as `HD`. */
const TAG_PATTERN = new RegExp(
  `[\\s\\-_|(\\[]*\\b(${[...QUALITY_TAGS]
    .sort((a, b) => b.length - a.length)
    .join('|')})\\b[\\s\\-_|)\\]]*$`,
  'i',
)

/**
 * How good a fallback an entry makes, lowest first.
 *
 * HD leads: it is the highest tier still reliably H.264. An untagged name
 * comes next — usually the same feed at a lower rate — and SD last, since it
 * is a real drop in picture. Anything else was ruled out as risky already.
 */
function fallbackRank(name: string): number {
  const { tag } = qualityOf(name)
  if (tag === 'hd') return 0
  if (tag === null) return 1
  if (tag === 'sd') return 2
  return 3
}

export interface ChannelQuality {
  /** The name with its quality suffix removed, lowercased for comparison. */
  base: string
  /** The suffix found, lowercased, or null when the name carries none. */
  tag: string | null
}

/** Splits a channel name into what identifies the channel and what grades it. */
export function qualityOf(name: string): ChannelQuality {
  const trimmed = name.trim()
  const match = trimmed.match(TAG_PATTERN)
  if (!match) return { base: trimmed.toLowerCase(), tag: null }

  const base = trimmed.slice(0, match.index).trim()
  // A name that is nothing but a tag grades nothing — keep it whole.
  if (!base) return { base: trimmed.toLowerCase(), tag: null }

  return { base: base.toLowerCase(), tag: match[1]!.toLowerCase() }
}

/**
 * The entry to offer after `current` failed to decode: the same channel at a
 * quality the browser stands a chance with.
 *
 * Returns null when the current entry is already a safe tier, or when the
 * portal carries no other quality for it — suggesting a swap that changes
 * nothing would be worse than saying nothing.
 */
export function decodableAlternative<T extends { id: string; name: string }>(
  current: T,
  channels: readonly T[],
): T | null {
  const { base, tag } = qualityOf(current.name)
  if (!tag || !RISKY_TAGS.has(tag)) return null

  const siblings = channels.filter((channel) => {
    if (channel.id === current.id) return false
    const quality = qualityOf(channel.name)
    if (quality.base !== base) return false
    return quality.tag === null || !RISKY_TAGS.has(quality.tag)
  })

  if (siblings.length === 0) return null

  return siblings.reduce((best, channel) =>
    fallbackRank(channel.name) < fallbackRank(best.name) ? channel : best,
  )
}
