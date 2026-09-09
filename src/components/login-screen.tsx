'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/context/session'
import { parsePortalInput } from '@/lib/portal'
import { deleteProfile, useProfiles } from '@/lib/profiles'
import { XtreamError, login } from '@/lib/xtream'
import { Badge, Button, Field, cx } from './ui'
import { LogoIcon, TrashIcon, UserIcon } from './icons'

export function LoginScreen() {
  const router = useRouter()
  const { signIn, switchProfile, ready, profile } = useSession()

  const [portal, setPortal] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
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

      const credentials = {
        host: parsed.host,
        username: finalUsername,
        password: finalPassword,
      }

      // Credentials are verified against the portal before anything is stored,
      // so a typo never leaves a broken profile behind.
      const account = await login(credentials)

      signIn({
        ...credentials,
        name: name.trim() || account.username || parsed.host.replace(/^https?:\/\//, ''),
      })
      router.replace('/accueil')
    } catch (caught) {
      setError(
        caught instanceof XtreamError || caught instanceof Error
          ? caught.message
          : 'Connexion impossible.',
      )
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
                            {saved.username} · {saved.host.replace(/^https?:\/\//, '')}
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
                <p role="alert" className="rounded-lg border border-danger-500/30 bg-danger-500/10 px-3 py-2.5 text-sm text-danger-500">
                  {error}
                </p>
              ) : null}

              <Button type="submit" size="lg" loading={pending} className="w-full">
                {pending ? 'Connexion…' : 'Se connecter'}
              </Button>
            </form>

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
