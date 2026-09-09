import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

/**
 * The portal address is supplied by whoever uses the app, and the proxy routes
 * fetch it from the server. That is a server-side request forgery primitive
 * unless the target is constrained, so every outbound URL passes through
 * `assertFetchableUrl` first.
 *
 * Self-hosted setups legitimately point at a portal on the local network, so
 * private ranges can be re-enabled with MBAPLAYER_ALLOW_PRIVATE_HOSTS=1. Cloud
 * metadata endpoints stay blocked either way.
 */

const ALLOW_PRIVATE = process.env.MBAPLAYER_ALLOW_PRIVATE_HOSTS === '1'

const BLOCKED_ALWAYS = new Set(['169.254.169.254', 'fd00:ec2::254', 'metadata.google.internal'])

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsafeUrlError'
  }
}

function ipv4IsPrivate(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return true
  const [a, b] = parts
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT 100.64.0.0/10
  if (a === 169 && b === 254) return true // link-local
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 192 && b === 0) return true // 192.0.0.0/24 and test nets
  if (a >= 224) return true // multicast + reserved
  return false
}

function ipv6IsPrivate(ip: string): boolean {
  const normalized = ip.toLowerCase().replace(/^\[|\]$/g, '')

  // Everything in ::/8 is special-purpose — the unspecified address, loopback,
  // IPv4-mapped, IPv4-translated and the deprecated IPv4-compatible range. The
  // URL parser rewrites ::ffff:127.0.0.1 to its hex form (::ffff:7f00:1), so
  // matching the dotted spelling alone would miss the mapped loopback entirely.
  if (normalized.startsWith('::')) return true

  if (/^fe[89ab][0-9a-f]:/.test(normalized)) return true // link-local fe80::/10
  if (/^f[cd][0-9a-f]{2}:/.test(normalized)) return true // unique local fc00::/7
  if (normalized.startsWith('ff')) return true // multicast

  // These all embed or translate to an IPv4 address, so they are a way around
  // the IPv4 rules above.
  if (normalized.startsWith('64:ff9b:')) return true // NAT64
  if (normalized.startsWith('2002:')) return true // 6to4

  if (normalized.startsWith('100:')) return true // discard-only 100::/64
  if (normalized.startsWith('2001:db8:')) return true // documentation

  return false
}

function ipIsPrivate(ip: string): boolean {
  const family = isIP(ip)
  if (family === 4) return ipv4IsPrivate(ip)
  if (family === 6) return ipv6IsPrivate(ip)
  return true
}

/**
 * Parses a user-supplied URL and rejects anything that is not a plain
 * http(s) request to a routable host.
 */
export async function assertFetchableUrl(raw: string): Promise<URL> {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new UnsafeUrlError('URL invalide.')
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeUrlError('Seuls les protocoles http et https sont autorisés.')
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (!hostname) throw new UnsafeUrlError('Nom d’hôte manquant.')
  if (BLOCKED_ALWAYS.has(hostname)) {
    throw new UnsafeUrlError('Cet hôte est bloqué.')
  }

  if (ALLOW_PRIVATE) return url

  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new UnsafeUrlError(
      'Les adresses locales sont bloquées. Définissez MBAPLAYER_ALLOW_PRIVATE_HOSTS=1 pour un portail sur votre réseau.',
    )
  }

  // A literal IP can be checked directly; a name has to be resolved first so a
  // DNS record pointing at 127.0.0.1 cannot slip through.
  if (isIP(hostname)) {
    if (ipIsPrivate(hostname)) {
      throw new UnsafeUrlError(
        'Adresse IP privée bloquée. Définissez MBAPLAYER_ALLOW_PRIVATE_HOSTS=1 pour un portail sur votre réseau.',
      )
    }
    return url
  }

  let addresses: { address: string }[]
  try {
    addresses = await lookup(hostname, { all: true })
  } catch {
    throw new UnsafeUrlError(`Impossible de résoudre l’hôte « ${hostname} ».`)
  }

  if (!addresses.length) throw new UnsafeUrlError(`Impossible de résoudre l’hôte « ${hostname} ».`)
  for (const { address } of addresses) {
    if (BLOCKED_ALWAYS.has(address) || ipIsPrivate(address)) {
      throw new UnsafeUrlError(
        'Cet hôte pointe vers une adresse privée. Définissez MBAPLAYER_ALLOW_PRIVATE_HOSTS=1 si c’est voulu.',
      )
    }
  }

  return url
}

/** Encodes a URL for the `u` query parameter of the stream proxy. */
export function encodeTarget(url: string): string {
  return Buffer.from(url, 'utf8').toString('base64url')
}

export function decodeTarget(encoded: string): string {
  return Buffer.from(encoded, 'base64url').toString('utf8')
}
