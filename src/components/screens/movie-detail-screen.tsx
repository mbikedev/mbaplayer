'use client'

import Link from 'next/link'
import { useSession } from '@/context/session'
import { useAsync } from '@/hooks/use-async'
import { formatClock, formatRating } from '@/lib/format'
import { clearResume, useResumeFor } from '@/lib/storage'
import { getMovieDetail } from '@/lib/xtream'
import { FavoriteButton } from '../favorite-button'
import { Badge, Button, EmptyState, ErrorMessage, LinkButton, Spinner, cx } from '../ui'
import { ChevronLeftIcon, PlayIcon } from '../icons'

export function MovieDetailScreen({ movieId }: { movieId: string }) {
  const { credentials } = useSession()
  const resume = useResumeFor('movie', movieId)

  const movie = useAsync(() => getMovieDetail(credentials!, movieId), [credentials, movieId], {
    enabled: Boolean(credentials),
  })

  if (movie.loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner className="size-8 text-gold-500" />
      </div>
    )
  }

  if (movie.error) return <ErrorMessage message={movie.error} onRetry={movie.reload} />

  if (!movie.data) {
    return (
      <EmptyState
        title="Film introuvable"
        description="Ce titre n’existe plus sur le portail."
        action={
          <LinkButton variant="secondary" size="sm" href="/films">
            Retour aux films
          </LinkButton>
        }
      />
    )
  }

  const film = movie.data
  const ratingLabel = formatRating(film.rating)
  const playHref = `/lecture?kind=movie&id=${encodeURIComponent(film.id)}&ext=${encodeURIComponent(film.extension)}`

  return (
    <article className="space-y-8">
      {/* Backdrop hero, with a graceful fall back to a flat panel. */}
      <div className="relative -mx-4 overflow-hidden sm:-mx-6 sm:rounded-card">
        {film.backdrop ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={film.backdrop}
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
              {film.poster ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={film.poster}
                  alt={`Affiche de ${film.name}`}
                  referrerPolicy="no-referrer"
                  className="size-full object-cover"
                />
              ) : (
                <span className="flex size-full items-center justify-center p-3 text-center text-xs text-ink-400">
                  {film.name}
                </span>
              )}
            </div>
          </div>

          <div className="min-w-0 flex-1 space-y-4">
            <Link
              href="/films"
              className="inline-flex items-center gap-1 text-sm text-ink-400 transition-colors hover:text-gold-300"
            >
              <ChevronLeftIcon className="size-4" />
              Films
            </Link>

            <h1 className="text-balance text-2xl font-semibold tracking-tight text-ink-50 sm:text-3xl">
              {film.name}
            </h1>

            <div className="flex flex-wrap items-center gap-2 text-sm text-ink-300">
              {ratingLabel ? <Badge tone="gold">{ratingLabel}</Badge> : null}
              {film.releaseDate ? <Badge>{film.releaseDate.slice(0, 4)}</Badge> : null}
              {film.duration ? <Badge>{film.duration}</Badge> : null}
              {film.genre ? <span className="text-ink-400">{film.genre}</span> : null}
            </div>

            {film.plot ? (
              <p className="max-w-3xl text-pretty text-sm leading-relaxed text-ink-300">{film.plot}</p>
            ) : null}

            <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              {film.director ? <DetailRow label="Réalisation" value={film.director} /> : null}
              {film.cast ? <DetailRow label="Avec" value={film.cast} /> : null}
              {film.country ? <DetailRow label="Pays" value={film.country} /> : null}
            </dl>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <LinkButton
                size="lg"
                href={resume ? `${playHref}&t=${Math.floor(resume.position)}` : playHref}
              >
                <PlayIcon className="size-5" />
                {resume ? `Reprendre à ${formatClock(resume.position)}` : 'Lire le film'}
              </LinkButton>

              {resume ? (
                <Button variant="ghost" onClick={() => clearResume('movie', film.id)}>
                  Recommencer depuis le début
                </Button>
              ) : null}

              <FavoriteButton kind="movie" id={film.id} name={film.name} poster={film.poster} />
            </div>

            {resume ? (
              <div className="h-1 max-w-md overflow-hidden rounded-full bg-ink-800">
                <div
                  className="h-full bg-gold-500"
                  style={{
                    width: `${Math.min(100, (resume.position / Math.max(resume.duration, 1)) * 100)}%`,
                  }}
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={cx('flex gap-2')}>
      <dt className="shrink-0 text-ink-400">{label}</dt>
      <dd className="min-w-0 truncate text-ink-200">{value}</dd>
    </div>
  )
}
