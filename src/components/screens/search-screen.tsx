'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { useSession } from '@/context/session'
import { useAsync } from '@/hooks/use-async'
import { searchable } from '@/lib/format'
import { getLiveChannels, getMovies, getSeries } from '@/lib/xtream'
import { PosterCard, PosterGrid } from '../poster-card'
import { EmptyState, ErrorMessage, GridSkeleton, PageHeader } from '../ui'

/** Cap per section so a two-letter query cannot render thousands of tiles. */
const MAX_RESULTS = 36

export function SearchScreen({ query }: { query: string }) {
  const { credentials } = useSession()
  const enabled = Boolean(credentials) && query.trim().length >= 2

  const movies = useAsync(() => getMovies(credentials!), [credentials], { enabled })
  const series = useAsync(() => getSeries(credentials!), [credentials], { enabled })
  const channels = useAsync(() => getLiveChannels(credentials!), [credentials], { enabled })

  const needle = searchable(query.trim())

  const movieHits = useMemo(
    () => (movies.data ?? []).filter((m) => searchable(m.name).includes(needle)).slice(0, MAX_RESULTS),
    [movies.data, needle],
  )
  const seriesHits = useMemo(
    () => (series.data ?? []).filter((s) => searchable(s.name).includes(needle)).slice(0, MAX_RESULTS),
    [series.data, needle],
  )
  const channelHits = useMemo(
    () => (channels.data ?? []).filter((c) => searchable(c.name).includes(needle)).slice(0, MAX_RESULTS),
    [channels.data, needle],
  )

  const loading = movies.loading || series.loading || channels.loading
  const total = movieHits.length + seriesHits.length + channelHits.length
  const error = movies.error ?? series.error ?? channels.error

  if (!query.trim()) {
    return (
      <div className="space-y-6">
        <PageHeader title="Recherche" />
        <EmptyState
          title="Que cherchez-vous ?"
          description="Tapez le nom d’une chaîne, d’un film ou d’une série dans la barre de recherche."
        />
      </div>
    )
  }

  if (query.trim().length < 2) {
    return (
      <div className="space-y-6">
        <PageHeader title={`Recherche : « ${query} »`} />
        <EmptyState title="Requête trop courte" description="Saisissez au moins deux caractères." />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Recherche : « ${query.trim()} »`}
        subtitle={loading ? 'Recherche en cours…' : `${total} résultat${total > 1 ? 's' : ''}`}
      />

      {error ? <ErrorMessage message={error} onRetry={() => { movies.reload(); series.reload(); channels.reload() }} /> : null}

      {loading ? <GridSkeleton count={12} /> : null}

      {!loading && total === 0 && !error ? (
        <EmptyState
          title="Aucun résultat"
          description={`Rien ne correspond à « ${query.trim()} » dans votre catalogue.`}
        />
      ) : null}

      {channelHits.length > 0 ? (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-ink-50">Chaînes ({channelHits.length})</h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {channelHits.map((channel) => (
              <li key={channel.id}>
                <Link
                  href="/direct"
                  className="flex items-center gap-3 rounded-card border border-ink-800 bg-ink-900 p-2.5 transition-colors hover:border-gold-500/40 hover:bg-ink-850"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-ink-850 text-[10px] text-ink-400">
                    {channel.icon ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={channel.icon}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={(event) => {
                          event.currentTarget.style.display = 'none'
                        }}
                        className="size-full object-contain"
                      />
                    ) : (
                      channel.num
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-100">{channel.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {movieHits.length > 0 ? (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-ink-50">Films ({movieHits.length})</h2>
          <PosterGrid>
            {movieHits.map((movie) => (
              <PosterCard
                key={movie.id}
                href={`/films/${movie.id}`}
                title={movie.name}
                poster={movie.poster}
                rating={movie.rating}
              />
            ))}
          </PosterGrid>
        </section>
      ) : null}

      {seriesHits.length > 0 ? (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-ink-50">Séries ({seriesHits.length})</h2>
          <PosterGrid>
            {seriesHits.map((show) => (
              <PosterCard
                key={show.id}
                href={`/series/${show.id}`}
                title={show.name}
                poster={show.poster}
                rating={show.rating}
              />
            ))}
          </PosterGrid>
        </section>
      ) : null}
    </div>
  )
}
