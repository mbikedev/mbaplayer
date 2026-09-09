import { NextResponse } from 'next/server'
import { playerApiUrl } from '@/lib/portal'
import { UnsafeUrlError, assertFetchableUrl } from '@/lib/server/safe-fetch'

/**
 * Proxies `player_api.php` calls to the user's portal.
 *
 * The browser cannot call a portal directly: portals almost never send CORS
 * headers, and most are http-only, which a page served over https is not
 * allowed to reach. Credentials are posted in the body rather than the query
 * string so they stay out of access logs and the browser history.
 */

const REQUEST_TIMEOUT_MS = 25_000

// Portals routinely reject requests from a default fetch agent, so identify as
// a regular player client.
const USER_AGENT = 'MBAPlayer/1.0 (Xtream Codes client)'

interface XtreamRequestBody {
  host?: unknown
  username?: unknown
  password?: unknown
  action?: unknown
  params?: unknown
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

export async function POST(request: Request) {
  let body: XtreamRequestBody
  try {
    body = await request.json()
  } catch {
    return badRequest('Corps de requête JSON invalide.')
  }

  const host = typeof body.host === 'string' ? body.host : ''
  const username = typeof body.username === 'string' ? body.username : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const action = typeof body.action === 'string' ? body.action : ''

  if (!host) return badRequest('Adresse du portail manquante.')
  if (!username || !password) return badRequest('Identifiants manquants.')

  const extraParams: Record<string, string> = {}
  if (body.params && typeof body.params === 'object' && !Array.isArray(body.params)) {
    for (const [key, value] of Object.entries(body.params as Record<string, unknown>)) {
      if (value === null || value === undefined) continue
      extraParams[key] = String(value)
    }
  }

  let target: string
  try {
    target = playerApiUrl(host, { username, password, action, ...extraParams })
  } catch {
    return badRequest('Adresse du portail invalide.')
  }

  try {
    await assertFetchableUrl(target)
  } catch (error) {
    if (error instanceof UnsafeUrlError) return badRequest(error.message)
    throw error
  }

  let upstream: Response
  try {
    upstream = await fetch(target, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json, text/plain, */*' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: 'no-store',
      redirect: 'follow',
    })
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError'
    return NextResponse.json(
      {
        error: timedOut
          ? 'Le portail n’a pas répondu à temps.'
          : 'Impossible de joindre le portail. Vérifiez l’adresse et votre connexion.',
      },
      { status: 502 },
    )
  }

  if (!upstream.ok) {
    return NextResponse.json(
      { error: `Le portail a répondu ${upstream.status} ${upstream.statusText}.` },
      { status: 502 },
    )
  }

  const text = await upstream.text()

  // A portal that rejects the credentials often replies with an HTML error page
  // or an empty body rather than JSON, so parsing failure is reported as such.
  try {
    return NextResponse.json(JSON.parse(text), {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch {
    return NextResponse.json(
      { error: 'Réponse illisible du portail (identifiants ou adresse incorrects ?).' },
      { status: 502 },
    )
  }
}
