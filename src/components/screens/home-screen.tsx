'use client'

import Link from 'next/link'
import { useSession } from '@/context/session'
import { useAsync } from '@/hooks/use-async'
import { formatClock, formatExpiry, progressPercent } from '@/lib/format'
import { useFavorites, useResumeList, type FavoriteItem, type ResumeItem } from '@/lib/storage'
import { getAccount } from '@/lib/xtream'
import { PosterCard, PosterGrid } from '../poster-card'
import { Badge, EmptyState, LinkButton, PageHeader, cx } from '../ui'
import { FilmIcon, GuideIcon, LiveIcon, PlayIcon, SeriesIcon, StarIcon } from '../icons'

export function HomeScreen() {
  const { credentials, profile } = useSession()
  // Both lists come from localStorage through the external store, so they are
  // empty during hydration and correct from the first client render onwards.
  const resume = useResumeList().slice(0, 12)
  const favorites = useFavorites().slice(0, 12)

  const account = useAsync(() => getAccount(credentials!), [credentials], {
    enabled: Boolean(credentials),
  })

  return (
    <div className="space-y-10">
      <PageHeader
        title={`Bonjour${profile ? `, ${profile.name}` : ''}`}
        subtitle="Reprenez où vous vous êtes arrêté, ou explorez le catalogue."
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SectionLink href="/direct" label="TV en direct" description="Chaînes et lecteur" Icon={LiveIcon} />
        <SectionLink href="/guide" label="Guide TV" description="Grille des programmes" Icon={GuideIcon} />
        <SectionLink href="/films" label="Films" description="Votre vidéothèque" Icon={FilmIcon} />
        <SectionLink href="/series" label="Séries" description="Saisons et épisodes" Icon={SeriesIcon} />
      </section>

      {resume.length > 0 ? (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-ink-50">Reprendre la lecture</h2>
          <div className="no-scrollbar -mx-4 flex gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
            {resume.map((item) => (
              <Link
                key={item.key}
                href={resumeHref(item)}
                className="group w-64 shrink-0 space-y-2"
                title={item.name}
              >
                <div className="relative aspect-video overflow-hidden rounded-card bg-ink-850 ring-1 ring-ink-800 transition-all group-hover:ring-gold-500/50">
                  {item.poster ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.poster}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      onError={(event) => {
                        event.currentTarget.style.display = 'none'
                      }}
                      className="size-full object-cover"
                    />
                  ) : null}
                  <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                    <span className="flex size-11 items-center justify-center rounded-full bg-gold-500/90 text-ink-950">
                      <PlayIcon className="ml-0.5 size-5" />
                    </span>
                  </span>
                  <span className="absolute inset-x-0 bottom-0 h-1 bg-ink-950/70">
                    <span
                      className="block h-full bg-gold-500"
                      style={{ width: `${progressPercent(item.position, item.duration)}%` }}
                    />
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-100 group-hover:text-gold-300">
                    {item.name}
                  </p>
                  <p className="truncate text-xs text-ink-400">
                    {item.subtitle ? `${item.subtitle} · ` : ''}
                    {formatClock(item.position)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-ink-50">Favoris</h2>
          {favorites.length > 0 ? (
            <Link href="/favoris" className="text-sm text-gold-400 hover:text-gold-300">
              Tout voir
            </Link>
          ) : null}
        </div>

        {favorites.length > 0 ? (
          <PosterGrid>
            {favorites.map((item) => (
              <PosterCard
                key={item.key}
                href={favoriteHref(item)}
                title={item.name}
                poster={item.poster}
                subtitle={kindLabel(item.kind)}
              />
            ))}
          </PosterGrid>
        ) : (
          <EmptyState
            title="Pas encore de favoris"
            description="Ajoutez des chaînes, des films ou des séries pour les retrouver ici."
            action={
              <LinkButton href="/direct" size="sm" variant="secondary">
                <StarIcon className="size-4" />
                Parcourir les chaînes
              </LinkButton>
            }
          />
        )}
      </section>

      {account.data ? (
        <section className="rounded-card border border-ink-800 bg-ink-900 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-400">Abonnement</h2>
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span className="flex items-center gap-2">
              <span className="text-ink-400">Statut</span>
              <Badge tone={account.data.status.toLowerCase() === 'active' ? 'success' : 'danger'}>
                {account.data.status}
              </Badge>
            </span>
            <span className="flex items-center gap-2">
              <span className="text-ink-400">Échéance</span>
              <span className="text-ink-100">{formatExpiry(account.data.expiresAt)}</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="text-ink-400">Connexions</span>
              <span className="text-ink-100">
                {account.data.activeConnections} / {account.data.maxConnections || '—'}
              </span>
            </span>
            <Link href="/compte" className="text-gold-400 hover:text-gold-300">
              Détails
            </Link>
          </div>
        </section>
      ) : null}
    </div>
  )
}

function SectionLink({
  href,
  label,
  description,
  Icon,
}: {
  href: string
  label: string
  description: string
  Icon: (props: React.SVGProps<SVGSVGElement>) => React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={cx(
        'group flex items-center gap-4 rounded-card border border-ink-800 bg-ink-900 p-4',
        'transition-colors hover:border-gold-500/40 hover:bg-ink-850',
      )}
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-gold-500/12 text-gold-400">
        <Icon className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink-50 group-hover:text-gold-300">{label}</span>
        <span className="block truncate text-xs text-ink-400">{description}</span>
      </span>
    </Link>
  )
}

function kindLabel(kind: FavoriteItem['kind']): string {
  return kind === 'live' ? 'Chaîne' : kind === 'movie' ? 'Film' : 'Série'
}

function favoriteHref(item: FavoriteItem): string {
  if (item.kind === 'movie') return `/films/${item.id}`
  if (item.kind === 'series') return `/series/${item.id}`
  return '/direct'
}

function resumeHref(item: ResumeItem): string {
  const params = new URLSearchParams({
    kind: item.kind,
    id: item.streamId,
    ext: item.extension,
    t: String(Math.floor(item.position)),
  })
  if (item.kind === 'series') params.set('series', item.id)
  return `/lecture?${params.toString()}`
}
