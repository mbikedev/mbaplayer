'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/context/session'
import { parsePortalInput } from '@/lib/portal'
import { deleteProfile, profileSubtitle, useProfiles } from '@/lib/profiles'
import { login } from '@/lib/catalog'
import type { Credentials } from '@/lib/credentials'
import { Badge, Button, Field, cx } from './ui'
import { LogoIcon, TrashIcon, UserIcon } from './icons'

export function LoginScreen() {
  const router = useRouter()
  const { signIn, switchProfile, ready, profile } = useSession()

  const [source, setSource] = useState<'xtream' | 'm3u'>('xtream')
  const [portal, setPortal] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [playlistUrl, setPlaylistUrl] = useState('')
  const [epgUrl, setEpgUrl] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  // Set when an Xtream attempt fails in the way a playlist-only subscription
  // fails, so the form can offer the other mode instead of just refusing.
  const [suggestPlaylist, setSuggestPlaylist] = useState(false)
  const [pending, setPending] = useState(false)
  const profiles = useProfiles()

  // An already-connected profile skips straight to the catalogue.
  useEffect(() => {
    if (ready && profile) router.replace('/accueil')
  }, [ready, profile, router])

  /**
   * Pasting a `get.php?username=…&password=…` playlist URL fills the whole
   * form, which is how most people receive their subscription details.
   */
  function handlePortalChange(value: string) {
    setPortal(value)
    if (!value.includes('username=')) return
    try {
      const parsed = parsePortalInput(value)
      setPortal(parsed.host)
      if (parsed.username) setUsername(parsed.username)
      if (parsed.password) setPassword(parsed.password)
    } catch {
      // Not a usable URL yet — the user is probably still typing.
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setPending(true)

    try {
      const parsed = parsePortalInput(portal)
      const finalUsername = username.trim() || parsed.username || ''
      const finalPassword = password || parsed.password || ''

      if (!finalUsername || !finalPassword) {
        throw new Error('Nom d’utilisateur et mot de passe requis.')
      }

      const credentials: Credentials = {
        source: 'xtream',
        host: parsed.host,
        username: finalUsername,
        password: finalPassword,
      }

      // Credentials are verified against the portal before anything is stored,
      // so a typo never leaves a broken profile behind.
      const summary = await login(credentials)

      signIn({
        source: 'xtream',
        host: parsed.host,
        username: finalUsername,
        password: finalPassword,
        name: name.trim() || summary.label,
      })
      router.replace('/accueil')
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Connexion impossible.'
      setError(message)
      // A 404 on player_api.php is the signature of a subscription that only
      // ships a playlist, which is exactly what the other mode is for.
      setSuggestPlaylist(/404/.test(message))
      setPending(false)
    }
  }

  async function handlePlaylistSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSuggestPlaylist(false)
    setPending(true)

    try {
      const url = playlistUrl.trim()
      if (!/^https?:\/\//i.test(url)) {
        throw new Error('L’adresse doit commencer par http:// ou https://.')
      }

      const guide = epgUrl.trim()
      if (guide && !/^https?:\/\//i.test(guide)) {
        throw new Error('L’adresse du guide doit commencer par http:// ou https://.')
      }

      const credentials: Credentials = {
        source: 'm3u',
        playlistUrl: url,
        epgUrl: guide || null,
      }

      // Loading the playlist is the only way to know the URL works, and it is
      // what the catalogue screens will read a moment later.
      const summary = await login(credentials)

      signIn({
        source: 'm3u',
        playlistUrl: url,
        epgUrl: guide || null,
        name: name.trim() || summary.label,
      })
      router.replace('/accueil')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Chargement impossible.')
      setPending(false)
    }
  }

  function handleUseProfile(id: string) {
    setError(null)
    if (switchProfile(id)) router.replace('/accueil')
    else setError('Ce profil est introuvable.')
  }

  function handleDeleteProfile(id: string) {
    deleteProfile(id)
  }

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      {/* Ambient backdrop: two soft gradients, no image asset to download. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_20%_0%,rgba(239,164,42,0.16),transparent),radial-gradient(50%_50%_at_85%_100%,rgba(79,70,229,0.14),transparent)]"
      />

      <div className="relative w-full max-w-5xl">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-center">
          <section className="space-y-6">
            <div className="flex items-center gap-3">
              <LogoIcon className="size-11 text-gold-500" />
              <div>
                <p className="text-2xl font-semibold tracking-tight text-ink-50">MBA Player</p>
                <p className="text-sm text-ink-400">Lecteur multimédia Xtream Codes</p>
              </div>
            </div>

            <h1 className="text-balance text-3xl font-semibold leading-tight tracking-tight text-ink-50 sm:text-4xl">
              Votre TV, vos films et vos séries — dans un seul lecteur.
            </h1>

            <p className="max-w-lg text-pretty text-sm leading-relaxed text-ink-300">
              Connectez le portail de votre abonnement et retrouvez vos chaînes en direct, votre
              vidéothèque et vos séries. Les identifiants restent sur cet appareil : MBA Player ne
              fournit aucun contenu et ne conserve rien sur un serveur.
            </p>

            <ul className="grid gap-3 text-sm text-ink-300 sm:grid-cols-2">
              {[
                'Direct, films et séries',
                'Guide EPG « en ce moment »',
                'Reprise de lecture',
                'Favoris et profils multiples',
              ].map((feature) => (
                <li key={feature} className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-gold-500" />
                  {feature}
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-ink-700 bg-ink-900/80 p-6 backdrop-blur-sm sm:p-8">
            {profiles.length > 0 ? (
              <div className="mb-6 space-y-2">
                <p className="text-sm font-medium text-ink-300">Profils enregistrés</p>
                <ul className="space-y-2">
                  {profiles.map((saved) => (
                    <li key={saved.id} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleUseProfile(saved.id)}
                        className={cx(
                          'flex flex-1 items-center gap-3 rounded-lg border border-ink-700 bg-ink-850 px-3 py-2.5 text-left',
                          'transition-colors hover:border-gold-500/50 hover:bg-ink-800',
                        )}
                      >
                        <UserIcon className="size-5 shrink-0 text-gold-500" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink-50">
                            {saved.name}
                          </span>
                          <span className="block truncate text-xs text-ink-400">
                            {profileSubtitle(saved)}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteProfile(saved.id)}
                        aria-label={`Supprimer le profil ${saved.name}`}
                        className="rounded-lg p-2 text-ink-400 transition-colors hover:bg-ink-800 hover:text-danger-500"
                      >
                        <TrashIcon className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center gap-3 pt-2">
                  <span className="h-px flex-1 bg-ink-700" />
                  <span className="text-xs uppercase tracking-wide text-ink-400">ou</span>
                  <span className="h-px flex-1 bg-ink-700" />
                </div>
              </div>
            ) : null}

            {/* Mode selector: the two ways a subscription is actually sold. */}
            <div
              role="tablist"
              aria-label="Type d’abonnement"
              className="mb-5 grid grid-cols-2 gap-1 rounded-lg border border-ink-700 bg-ink-950 p-1"
            >
              {(
                [
                  { id: 'xtream', label: 'API Xtream Codes' },
                  { id: 'm3u', label: 'Lien M3U' },
                ] as const
              ).map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  role="tab"
                  aria-selected={source === mode.id}
                  onClick={() => {
                    setSource(mode.id)
                    setError(null)
                    setSuggestPlaylist(false)
                  }}
                  className={cx(
                    'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    source === mode.id
                      ? 'bg-gold-500/15 text-gold-300'
                      : 'text-ink-400 hover:text-ink-100',
                  )}
                >
                  {mode.label}
                </button>
              ))}
            </div>

            {source === 'xtream' ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <Field
                  label="Adresse du portail"
                  placeholder="http://mon-portail.tv:8080"
                  value={portal}
                  onChange={(event) => handlePortalChange(event.target.value)}
                  autoComplete="url"
                  inputMode="url"
                  required
                  hint="Collez aussi votre lien M3U complet : les identifiants seront extraits."
                />
                <Field
                  label="Nom d’utilisateur"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="username"
                  required
                />
                <Field
                  label="Mot de passe"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                />
                <Field
                  label="Nom du profil (facultatif)"
                  placeholder="Salon"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />

                {error ? (
                  <div
                    role="alert"
                    className="space-y-2 rounded-lg border border-danger-500/30 bg-danger-500/10 px-3 py-2.5 text-sm text-danger-500"
                  >
                    <p>{error}</p>
                    {suggestPlaylist ? (
                      <p className="text-ink-300">
                        Ce portail n’expose pas l’API Xtream Codes.{' '}
                        <button
                          type="button"
                          onClick={() => {
                            setSource('m3u')
                            setError(null)
                            setSuggestPlaylist(false)
                          }}
                          className="font-medium text-gold-400 underline underline-offset-2 hover:text-gold-300"
                        >
                          Essayez avec votre lien M3U
                        </button>
                        .
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <Button type="submit" size="lg" loading={pending} className="w-full">
                  {pending ? 'Connexion…' : 'Se connecter'}
                </Button>
              </form>
            ) : (
              <form onSubmit={handlePlaylistSubmit} className="space-y-4">
                <Field
                  label="Lien de la playlist M3U"
                  placeholder="http://mon-portail.tv:8080/get.php?username=…&password=…"
                  value={playlistUrl}
                  onChange={(event) => setPlaylistUrl(event.target.value)}
                  autoComplete="url"
                  inputMode="url"
                  required
                  hint="Le lien complet fourni par votre revendeur, identifiants inclus."
                />
                <Field
                  label="Adresse du guide XMLTV (facultatif)"
                  placeholder="http://mon-portail.tv:8080/xmltv.php?username=…"
                  value={epgUrl}
                  onChange={(event) => setEpgUrl(event.target.value)}
                  autoComplete="url"
                  inputMode="url"
                  hint="À renseigner seulement si la playlist n’en déclare pas elle-même."
                />
                <Field
                  label="Nom du profil (facultatif)"
                  placeholder="Salon"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />

                {error ? (
                  <p
                    role="alert"
                    className="rounded-lg border border-danger-500/30 bg-danger-500/10 px-3 py-2.5 text-sm text-danger-500"
                  >
                    {error}
                  </p>
                ) : null}

                <Button type="submit" size="lg" loading={pending} className="w-full">
                  {pending ? 'Chargement de la playlist…' : 'Charger la playlist'}
                </Button>

                <p className="text-xs leading-relaxed text-ink-400">
                  Une playlist ne contient ni résumés ni rattrapage — seulement les chaînes et les
                  fichiers. Le guide des programmes fonctionne si une adresse XMLTV est disponible.
                  Utilisez l’API Xtream Codes si votre abonnement la propose.
                </p>
              </form>
            )}

            <p className="mt-5 text-xs leading-relaxed text-ink-400">
              <Badge tone="gold">Note</Badge>{' '}
              Les identifiants sont stockés dans ce navigateur uniquement. Utilisez seulement des
              services auxquels vous êtes légalement abonné.
            </p>
          </section>
        </div>

        <p className="mt-10 text-center text-xs text-ink-400">
          {profiles.length > 0
            ? `${profiles.length} profil${profiles.length > 1 ? 's' : ''} enregistré${profiles.length > 1 ? 's' : ''} sur cet appareil`
            : 'Aucun profil enregistré sur cet appareil'}
        </p>
      </div>
    </main>
  )
}
