/**
 * Masking the credentials an IPTV URL carries.
 *
 * Xtream addresses embed the username and password twice over: as query
 * parameters on `player_api.php` and `get.php`, and as bare path segments on
 * the stream and timeshift forms — `/timeshift/USER/PASS/49/…`. Anything that
 * shows a URL to the viewer, logs it, or copies it into a bug report has to
 * blank both, so the value is masked wherever it appears rather than at the
 * places it is expected.
 */

const MASK = '***'

/** Escapes a literal for use inside a RegExp. */
function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Replaces every occurrence of the given secrets in a URL with `***`.
 *
 * Both the raw value and its percent-encoded form are masked: the path form
 * encodes a password containing `/` or `+`, the query form encodes it
 * differently again, and a leak in either shape is still a leak.
 *
 * Short secrets are skipped. A two-character password is not worth masking at
 * the cost of blanking every coincidental occurrence in a host name or path.
 */
export function redactUrl(url: string, secrets: readonly (string | undefined)[]): string {
  let out = url
  for (const secret of secrets) {
    const trimmed = secret?.trim()
    if (!trimmed || trimmed.length < 3) continue
    for (const form of new Set([trimmed, encodeURIComponent(trimmed)])) {
      out = out.replace(new RegExp(escape(form), 'g'), MASK)
    }
  }
  return out
}
