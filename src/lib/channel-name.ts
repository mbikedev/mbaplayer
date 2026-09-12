/**
 * Recognising the decorative entries providers mix into their channel lists.
 *
 * Xtream panels have no notion of a group heading in the live list, so
 * resellers fake one by publishing an entry whose name is a banner:
 *
 *     -----▼|BR| VOD BRAZIL |BR|▼-----
 *     ---●★| VOD CRIANCAS |★●---
 *     ▼--- |DE| VOD 4K UHD / 3D |DE| ---▼
 *
 * They carry a stream id like any other channel, and the panel answers for it,
 * but nothing ever arrives. Left alone they are indistinguishable from real
 * channels, and since they sort first the player opens on one and waits for a
 * video that does not exist.
 */

/**
 * Characters used to build those banners. Letters and digits are deliberately
 * absent: a banner is recognised by its frame, not by the words inside it,
 * which are ordinary category names.
 *
 * `/` and `\` are deliberately absent too. They never frame a banner, and
 * counting them would split `VOD 4K UHD / 3D` in two when the label is cut out
 * of its frame below.
 */
const ORNAMENT = String.raw`\-=_~*+#.:;!¡•·●○◦★☆✦✧▼▲▽△◆◇■□<>«»|`

/** Everything but the words, used to cut a banner apart. */
const ORNAMENT_RUN = new RegExp(`[${ORNAMENT}]+`, 'g')

/**
 * Three is the shortest run that reads as a rule rather than as punctuation:
 * `|FR| TF1` and `TF1 HD+` keep their single separators, `--- FRANCE ---` does
 * not.
 */
const LEADING_RULE = new RegExp(`^[${ORNAMENT}]{3,}`)
const TRAILING_RULE = new RegExp(`[${ORNAMENT}]{3,}$`)

/** True when the name has no letter and no digit in any script. */
function isAllOrnament(name: string): boolean {
  return !/[\p{L}\p{N}]/u.test(name)
}

/**
 * Whether a channel name is a group banner rather than a channel.
 *
 * Two shapes qualify: a name framed by a rule at both ends, and a name with no
 * letters or digits at all. Requiring both ends keeps a channel that merely
 * starts with a country tag out of it.
 */
export function isDecorativeName(name: string): boolean {
  const trimmed = name.trim()
  if (!trimmed) return true
  if (isAllOrnament(trimmed)) return true
  return LEADING_RULE.test(trimmed) && TRAILING_RULE.test(trimmed)
}

/**
 * The first entry worth opening automatically.
 *
 * Falls back to the head of the list when every entry looks decorative, so the
 * player is never left empty on a list that does have content — better a
 * channel that fails loudly than a blank screen.
 */
export function firstPlayable<T extends { name: string }>(entries: readonly T[]): T | null {
  return entries.find((entry) => !isDecorativeName(entry.name)) ?? entries[0] ?? null
}

/**
 * Short label to stand in for a channel logo.
 *
 * Portal logo URLs rot constantly — dead hosts, hotlink protection, plain 404s
 * — and an <img> that fails leaves a blank square with no way to tell one
 * channel from the next. The channel number is the best substitute when the
 * portal numbers its list; otherwise the initials of the name, once the
 * reseller's bracketed tags are stripped.
 */
export function logoFallback(name: string, num: number | null | undefined): string {
  if (typeof num === 'number' && Number.isFinite(num) && num > 0) return String(num)

  const words = name
    // Reseller tags say nothing about the channel: |FR|, (FR), [4K].
    .replace(/[|(\[][^|)\]]*[|)\]]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  const initials = words
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join('')

  return initials || '—'
}

/**
 * The words inside a banner, without its frame.
 *
 *     -----▼|BR| VOD BRAZIL |BR|▼-----   ->  VOD BRAZIL
 *     ---●★| VOD CRIANCAS |★●---         ->  VOD CRIANCAS
 *     ▼--- |DE| VOD 4K UHD / 3D |DE| ---▼ ->  VOD 4K UHD / 3D
 *
 * The frame is not a fixed shape — the pipes sit around the country tag in one
 * and around the label itself in the next — so rather than peel layers off the
 * ends, this cuts the name at every run of ornament and keeps the piece
 * carrying the most letters and digits. Country tags lose to the label because
 * they are shorter, which is the whole reason they are tags.
 *
 * Falls back to the name as given when nothing survives the cut.
 */
export function bannerLabel(name: string): string {
  const pieces = name
    .split(ORNAMENT_RUN)
    .map((piece) => piece.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  let best = ''
  let bestWeight = 0
  for (const piece of pieces) {
    const weight = (piece.match(/[\p{L}\p{N}]/gu) ?? []).length
    if (weight > bestWeight) {
      best = piece
      bestWeight = weight
    }
  }

  return best || name.trim()
}
