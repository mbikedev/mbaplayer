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
 */
const ORNAMENT = String.raw`\-=_~*+#.:;!¡•·●○◦★☆✦✧▼▲▽△◆◇■□<>«»|/\\`

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
