import { NextResponse } from 'next/server'
import { UnsafeUrlError, assertFetchableUrl } from '@/lib/server/safe-fetch'
import { PORTAL_USER_AGENT } from '@/lib/server/user-agent'

/**
 * Fetches an M3U playlist for the client.
 *
 * Same reasons as the other proxy routes — portals send no CORS headers and
 * most are http-only — plus one specific to playlists: they are fetched with
 * the credentials embedded in the URL, so keeping the request server-side keeps
 * that URL out of the browser's network log for anything else on the page.
 */

const REQUEST_TIMEOUT_MS = 60_000

/**
 * A large provider's `m3u_plus` playlist runs to tens of megabytes. This is
 * generous enough for those and still bounded, so a mistyped URL pointing at
 * something enormous cannot exhaust memory.
 */
const MAX_BYTES = 96 * 1024 * 1024

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

/** The attempted URL with credentials masked, safe to show the user. */
function redacted(target: string): string {
  try {
    const url = new URL(target)
    for (const key of ['username', 'password']) {
      if (url.searchParams.has(key)) url.searchParams.set(key, '***')
    }
    return url.toString()
  } catch {
    return '(URL invalide)'
  }
}

export async function POST(request: Request) {
  let body: { url?: unknown }
  try {
    body = await request.json()
  } catch {
    return badRequest('Corps de requête JSON invalide.')
  }

  const target = typeof body.url === 'string' ? body.url.trim() : ''
  if (!target) return badRequest('Adresse de la playlist manquante.')

  try {
    await assertFetchableUrl(target)
  } catch (error) {
    if (error instanceof UnsafeUrlError) return badRequest(error.message)
    throw error
  }

  let upstream: Response
  try {
    upstream = await fetch(target, {
      headers: { 'User-Agent': PORTAL_USER_AGENT, Accept: '*/*' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: 'no-store',
      redirect: 'follow',
    })
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError'
    return NextResponse.json(
      {
        error: timedOut
          ? 'La playlist n’a pas répondu à temps. Les grosses playlists peuvent être longues à générer.'
          : 'Impossible de joindre la playlist. Vérifiez l’adresse et votre connexion.',
      },
      { status: 502 },
    )
  }

  if (!upstream.ok) {
    return NextResponse.json(
      { error: `La playlist a répondu ${upstream.status} ${upstream.statusText} pour ${redacted(target)}.` },
      { status: 502 },
    )
  }

  // Read with a running byte count rather than calling text(): the cap has to
  // apply while the body arrives, not after it is already in memory.
  const reader = upstream.body?.getReader()
  if (!reader) return NextResponse.json({ error: 'Playlist vide.' }, { status: 502 })

  const chunks: Uint8Array[] = []
  let received = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      received += value.byteLength
      if (received > MAX_BYTES) {
        await reader.cancel()
        return NextResponse.json(
          {
            error: `Playlist trop volumineuse (plus de ${Math.round(MAX_BYTES / 1024 / 1024)} Mo). Demandez à votre fournisseur une playlist filtrée.`,
          },
          { status: 502 },
        )
      }
      chunks.push(value)
    }
  } catch {
    return NextResponse.json({ error: 'Transfert de la playlist interrompu.' }, { status: 502 })
  }

  const body_ = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    body_.set(chunk, offset)
    offset += chunk.byteLength
  }
  const text = new TextDecoder('utf-8').decode(body_)

  // A provider that rejects the credentials usually answers with an HTML error
  // page and a 200, so the body has to be checked rather than the status.
  if (!/^\s*#EXTM3U/i.test(text) && !/#EXTINF/i.test(text)) {
    return NextResponse.json(
      {
        error: `La réponse de ${redacted(target)} n’est pas une playlist M3U. Identifiants refusés, ou l’adresse pointe vers autre chose.`,
      },
      { status: 502 },
    )
  }

  return new NextResponse(text, {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}
