'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useSession } from '@/context/session'
import { useAsync } from '@/hooks/use-async'
import { formatClock, formatRating, progressPercent } from '@/lib/format'
import { useResumeList } from '@/lib/storage'
import { getSeriesDetail } from '@/lib/catalog'
import type { Episode } from '@/lib/xtream-types'
import { FavoriteButton } from '../favorite-button'
import { Badge, EmptyState, ErrorMessage, LinkButton, Spinner, cx } from '../ui'
import { ChevronLeftIcon, PlayIcon } from '../icons'

export function SeriesDetailScreen({ seriesId }: { seriesId: string }) {
  const { credentials } = useSession()
  const resumeItems = useResumeList()

  // `null` means "not chosen yet", which resolves to the first season the
  // portal actually returned episodes for — derived rather than set in an
  // effect, so there is no render showing an empty episode list.
  const [pickedSeason, setPickedSeason] = useState<number | null>(null)

  const series = useAsync(() => getSeriesDetail(credentials!, seriesId), [credentials, seriesId], {
    enabled: Boolean(credentials),
  })

  const season = pickedSeason ?? series.data?.seasons[0]?.number ?? null

  const episodes = useMemo(() => {
    if (!series.data || season === null) return []
    return series.data.episodesBySeason[season] ?? []
  }, [series.data, season])

  const resumeByStreamId = useMemo(
    () => new Map(resumeItems.filter((r) => r.kind === 'series').map((r) => [r.streamId, r])),
    [resumeItems],
  )

  if (series.loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner className="size-8 text-gold-500" />
      </div>
    )
  }

  if (series.error) return <ErrorMessage message={series.error} onRetry={series.reload} />

  if (!series.data) {
    return (
      <EmptyState
        title="Série introuvable"
        description="Ce titre n’existe plus sur le portail."
        action={
          <LinkButton variant="secondary" size="sm" href="/series">
            Retour aux séries
          </LinkButton>
        }
      />
    )
  }

  const show = series.data
  const ratingLabel = formatRating(show.rating)

  function episodeHref(episode: Episode, position?: number) {
    const params = new URLSearchParams({
      kind: 'series',
      id: episode.id,
      ext: episode.extension,
      series: show.id,
      s: String(episode.season),
      e: String(episode.episodeNum),
    })
    if (position) params.set('t', String(Math.floor(position)))
    return `/lecture?${params.toString()}`
  }

  const firstEpisode = episodes[0]

  return (
    <article className="space-y-8">
      <div className="relative -mx-4 overflow-hidden sm:-mx-6 sm:rounded-card">
        {show.backdrop ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={show.backdrop}
            alt=""
            referrerPolicy="no-referrer"
            onError={(event) => {
              event.currentTarget.style.display = 'none'
            }}
            className="absolute inset-0 size-full object-cover opacity-35"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/85 to-ink-950/50" />

        <div className="relative flex flex-col gap-6 p-4 sm:flex-row sm:p-8">
          <div className="w-36 shrink-0 sm:w-48">
            <div className="aspect-[2/3] overflow-hidden rounded-card bg-ink-850 ring-1 ring-ink-700">
              {show.poster ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={show.poster}
                  alt={`Affiche de ${show.name}`}
                  referrerPolicy="no-referrer"
                  className="size-full object-cover"
                />
              ) : (
                <span className="flex size-full items-center justify-center p-3 text-center text-xs text-ink-400">
                  {show.name}
                </span>
              )}
            </div>
          </div>

          <div className="min-w-0 flex-1 space-y-4">
            <Link
              href="/series"
              className="inline-flex items-center gap-1 text-sm text-ink-400 transition-colors hover:text-gold-300"
            >
              <ChevronLeftIcon className="size-4" />
              Séries
            </Link>

            <h1 className="text-balance text-2xl font-semibold tracking-tight text-ink-50 sm:text-3xl">
              {show.name}
            </h1>

            <div className="flex flex-wrap items-center gap-2 text-sm text-ink-300">
              {ratingLabel ? <Badge tone="gold">{ratingLabel}</Badge> : null}
              {show.releaseDate ? <Badge>{show.releaseDate.slice(0, 4)}</Badge> : null}
              <Badge>
                {show.seasons.length} saison{show.seasons.length > 1 ? 's' : ''}
              </Badge>
              {show.genre ? <span className="text-ink-400">{show.genre}</span> : null}
            </div>

            {show.plot ? (
              <p className="max-w-3xl text-pretty text-sm leading-relaxed text-ink-300">{show.plot}</p>
            ) : null}

            <div className="flex flex-wrap items-center gap-3 pt-2">
              {firstEpisode ? (
                <LinkButton size="lg" href={episodeHref(firstEpisode)}>
                  <PlayIcon className="size-5" />
                  Lire S{firstEpisode.season} E{firstEpisode.episodeNum}
                </LinkButton>
              ) : null}
              <FavoriteButton kind="series" id={show.id} name={show.name} poster={show.poster} />
            </div>
          </div>
        </div>
      </div>

      {show.seasons.length > 0 ? (
        <section className="space-y-4">
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
            {show.seasons.map((entry) => (
              <button
                key={entry.number}
                type="button"
                onClick={() => setPickedSeason(entry.number)}
                aria-pressed={season === entry.number}
                className={cx(
                  'shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm transition-colors',
                  season === entry.number
                    ? 'border-gold-500 bg-gold-500/15 text-gold-300'
                    : 'border-ink-700 bg-ink-900 text-ink-300 hover:border-ink-600 hover:text-ink-100',
                )}
              >
                {entry.name}
              </button>
            ))}
          </div>

          <ul className="space-y-2">
            {episodes.map((episode) => {
              const resume = resumeByStreamId.get(episode.id)
              const percent = resume ? progressPercent(resume.position, resume.duration) : 0
              return (
                <li key={episode.id}>
                  <Link
                    href={episodeHref(episode, resume?.position)}
                    className="group flex items-center gap-4 rounded-card border border-ink-800 bg-ink-900 p-3 transition-colors hover:border-gold-500/40 hover:bg-ink-850"
                  >
                    <div className="relative hidden aspect-video w-36 shrink-0 overflow-hidden rounded-lg bg-ink-850 sm:block">
                      {episode.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={episode.image}
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
                        <span className="flex size-9 items-center justify-center rounded-full bg-gold-500/90 text-ink-950">
                          <PlayIcon className="ml-0.5 size-4" />
                        </span>
                      </span>
                      {percent > 0 ? (
                        <span className="absolute inset-x-0 bottom-0 h-1 bg-ink-950/70">
                          <span className="block h-full bg-gold-500" style={{ width: `${percent}%` }} />
                        </span>
                      ) : null}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink-100 group-hover:text-gold-300">
                        <span className="text-ink-400">E{episode.episodeNum}</span> · {episode.title}
                      </p>
                      {episode.plot ? (
                        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-400">
                          {episode.plot}
                        </p>
                      ) : null}
                      {resume ? (
                        <p className="mt-1 text-xs text-gold-400">
                          Reprendre à {formatClock(resume.position)}
                        </p>
                      ) : episode.duration ? (
                        <p className="mt-1 text-xs text-ink-400">{episode.duration}</p>
                      ) : null}
                    </div>

                    <PlayIcon className="size-5 shrink-0 text-ink-500 transition-colors group-hover:text-gold-400 sm:hidden" />
                  </Link>
                </li>
              )
            })}
          </ul>

          {episodes.length === 0 ? (
            <EmptyState
              title="Aucun épisode"
              description="Le portail n’a renvoyé aucun épisode pour cette saison."
            />
          ) : null}
        </section>
      ) : (
        <EmptyState
          title="Aucune saison"
          description="Le portail n’a renvoyé aucun épisode pour cette série."
        />
      )}
    </article>
  )
}
