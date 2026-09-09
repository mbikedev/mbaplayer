'use client'

import { useSession } from '@/context/session'
import { useAsync } from '@/hooks/use-async'
import { formatDate, formatExpiry } from '@/lib/format'
import { deleteProfile, useProfiles } from '@/lib/profiles'
import { getAccount, clearCatalogCache } from '@/lib/xtream'
import { Badge, Button, ErrorMessage, PageHeader, Spinner, cx } from '../ui'
import { LogoutIcon, RefreshIcon, TrashIcon, UserIcon } from '../icons'

export function AccountScreen() {
  const { credentials, profile, signOut, settings, updateSettings, switchProfile } = useSession()
  const profiles = useProfiles()

  const account = useAsync(() => getAccount(credentials!), [credentials], {
    enabled: Boolean(credentials),
  })

  return (
    <div className="max-w-3xl space-y-8">
      <PageHeader
        title="Compte et réglages"
        subtitle={profile ? `${profile.username} · ${profile.host.replace(/^https?:\/\//, '')}` : undefined}
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              clearCatalogCache()
              account.reload()
            }}
          >
            <RefreshIcon className="size-4" />
            Vider le cache
          </Button>
        }
      />

      <section className="rounded-card border border-ink-800 bg-ink-900 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-400">Abonnement</h2>

        {account.loading ? (
          <div className="flex items-center gap-3 py-4 text-sm text-ink-400">
            <Spinner className="size-4" />
            Interrogation du portail…
          </div>
        ) : account.error ? (
          <div className="pt-4">
            <ErrorMessage message={account.error} onRetry={account.reload} />
          </div>
        ) : account.data ? (
          <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
            <Row label="Statut">
              <Badge tone={account.data.status.toLowerCase() === 'active' ? 'success' : 'danger'}>
                {account.data.status}
              </Badge>
              {account.data.isTrial ? <Badge tone="gold">Essai</Badge> : null}
            </Row>
            <Row label="Expiration">
              <span className="text-ink-100">{formatDate(account.data.expiresAt)}</span>
              <span className="text-ink-400">({formatExpiry(account.data.expiresAt)})</span>
            </Row>
            <Row label="Connexions actives">
              <span className="text-ink-100">
                {account.data.activeConnections} / {account.data.maxConnections || '—'}
              </span>
            </Row>
            <Row label="Créé le">
              <span className="text-ink-100">{formatDate(account.data.createdAt)}</span>
            </Row>
            {account.data.allowedFormats.length ? (
              <Row label="Formats autorisés">
                <span className="text-ink-100">{account.data.allowedFormats.join(', ')}</span>
              </Row>
            ) : null}
            {account.data.serverTimezone ? (
              <Row label="Fuseau du serveur">
                <span className="text-ink-100">{account.data.serverTimezone}</span>
              </Row>
            ) : null}
          </dl>
        ) : null}

        {account.data?.message ? (
          <p className="mt-4 rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-sm text-ink-300">
            {account.data.message}
          </p>
        ) : null}
      </section>

      <section className="rounded-card border border-ink-800 bg-ink-900 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-400">Lecture</h2>

        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="max-w-sm">
              <p className="text-sm font-medium text-ink-100">Format des chaînes en direct</p>
              <p className="text-xs text-ink-400">
                HLS est le seul format que les navigateurs lisent nativement. N’utilisez TS que si
                votre portail ne fournit pas de m3u8.
              </p>
            </div>
            <div className="flex gap-2">
              {(['m3u8', 'ts'] as const).map((format) => (
                <button
                  key={format}
                  type="button"
                  onClick={() => updateSettings({ liveFormat: format })}
                  aria-pressed={settings.liveFormat === format}
                  className={cx(
                    'rounded-lg border px-3 py-1.5 text-sm transition-colors',
                    settings.liveFormat === format
                      ? 'border-gold-500 bg-gold-500/15 text-gold-300'
                      : 'border-ink-700 bg-ink-850 text-ink-300 hover:text-ink-100',
                  )}
                >
                  {format.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <Toggle
            label="Lecture automatique de l’épisode suivant"
            description="Enchaîne sur l’épisode suivant à la fin d’un épisode de série."
            checked={settings.autoplayNext}
            onChange={(checked) => updateSettings({ autoplayNext: checked })}
          />

          <Toggle
            label="Masquer les catégories adultes"
            description="Filtre les catégories dont le nom contient « adult », « XXX » ou « 18+ »."
            checked={settings.hideAdult}
            onChange={(checked) => updateSettings({ hideAdult: checked })}
          />
        </div>
      </section>

      <section className="rounded-card border border-ink-800 bg-ink-900 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-400">
          Profils sur cet appareil
        </h2>

        <ul className="mt-4 space-y-2">
          {profiles.map((entry) => (
            <li key={entry.id} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => switchProfile(entry.id)}
                disabled={entry.id === profile?.id}
                className={cx(
                  'flex flex-1 items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
                  entry.id === profile?.id
                    ? 'cursor-default border-gold-500/40 bg-gold-500/10'
                    : 'border-ink-700 bg-ink-850 hover:border-gold-500/40 hover:bg-ink-800',
                )}
              >
                <UserIcon
                  className={cx(
                    'size-5 shrink-0',
                    entry.id === profile?.id ? 'text-gold-400' : 'text-ink-400',
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink-50">{entry.name}</span>
                  <span className="block truncate text-xs text-ink-400">
                    {entry.username} · {entry.host.replace(/^https?:\/\//, '')}
                  </span>
                </span>
                {entry.id === profile?.id ? <Badge tone="gold">Actif</Badge> : null}
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteProfile(entry.id)
                  if (entry.id === profile?.id) signOut()
                }}
                aria-label={`Supprimer le profil ${entry.name}`}
                className="rounded-lg p-2 text-ink-400 transition-colors hover:bg-ink-800 hover:text-danger-500"
              >
                <TrashIcon className="size-4" />
              </button>
            </li>
          ))}
        </ul>

        <p className="mt-4 text-xs leading-relaxed text-ink-400">
          Les identifiants sont conservés dans le stockage local de ce navigateur, en clair.
          Supprimez le profil si l’appareil est partagé.
        </p>
      </section>

      <Button variant="danger" onClick={signOut}>
        <LogoutIcon className="size-4" />
        Se déconnecter
      </Button>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <dt className="w-full text-ink-400 sm:w-auto sm:min-w-[9rem]">{label}</dt>
      <dd className="flex flex-wrap items-center gap-2">{children}</dd>
    </div>
  )
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="max-w-sm">
        <p className="text-sm font-medium text-ink-100">{label}</p>
        <p className="text-xs text-ink-400">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors',
          checked ? 'bg-gold-500' : 'bg-ink-700',
        )}
      >
        <span
          className={cx(
            'absolute top-0.5 size-5 rounded-full bg-ink-950 transition-transform',
            checked ? 'translate-x-[1.375rem]' : 'translate-x-0.5',
          )}
        />
      </button>
    </div>
  )
}
