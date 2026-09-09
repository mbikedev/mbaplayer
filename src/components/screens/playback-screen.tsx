'use client'

import { useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/context/session'
import { useAsync } from '@/hooks/use-async'
import { saveResume } from '@/lib/storage'
import { getMovieDetail, getSeriesDetail, streamUrl } from '@/lib/catalog'
import type { Episode, SeriesDetail } from '@/lib/xtream-types'
import { VideoPlayer } from '../video-player'
import { EmptyState, ErrorMessage, LinkButton, Spinner } from '../ui'

interface PlaybackScreenProps {
  kind: 'movie' | 'series'
  streamId: string
  extension: string
  startPosition: number
  seriesId: string | null
  season: number | null
  episodeNum: number | null
}

/** Containers a browser can actually decode without a transcoder. */
const BROWSER_FRIENDLY = new Set(['mp4', 'm4v', 'webm', 'm3u8', 'mov'])

export function PlaybackScreen({
  kind,
  streamId,
  extension,
  startPosition,
  seriesId,
  season,
  episodeNum,
}: PlaybackScreenProps) {
  const router = useRouter()
  const { credentials, ready, settings } = useSession()

  // Everything playback-related comes from the URL. Advancing to the next
  // episode rewrites the URL, which re-renders this screen with new props —
  // no mirrored state to keep in sync, and a reload or a shared link lands on
  // exactly the episode that was playing.
  const movie = useAsync(
    () => getMovieDetail(credentials!, streamId),
    [credentials, streamId],
    { enabled: Boolean(credentials) && kind === 'movie' && Boolean(streamId) },
  )

  const series = useAsync(
    () => getSeriesDetail(credentials!, seriesId!),
    [credentials, seriesId],
    { enabled: Boolean(credentials) && kind === 'series' && Boolean(seriesId) },
  )

  const episode = useMemo<Episode | null>(() => {
    if (kind !== 'series' || !series.data) return null
    return findEpisode(series.data, streamId)
  }, [kind, series.data, streamId])

  const nextEpisode = useMemo<Episode | null>(() => {
    if (kind !== 'series' || !series.data || !episode) return null
    const inSeason = series.data.episodesBySeason[episode.season] ?? []
    const index = inSeason.findIndex((e) => e.id === episode.id)
    if (index >= 0 && index + 1 < inSeason.length) return inSeason[index + 1]

    // Fall through to the first episode of the following season.
    const seasons = series.data.seasons.map((s) => s.number).sort((a, b) => a - b)
    const seasonIndex = seasons.indexOf(episode.season)
    const nextSeason = seasonIndex >= 0 ? seasons[seasonIndex + 1] : undefined
    if (nextSeason === undefined) return null
    return series.data.episodesBySeason[nextSeason]?.[0] ?? null
  }, [kind, series.data, episode])

  const title = kind === 'movie' ? (movie.data?.name ?? 'Lecture') : (series.data?.name ?? 'Lecture')
  const subtitle =
    kind === 'series' && episode
      ? `S${episode.season} E${episode.episodeNum} · ${episode.title}`
      : (movie.data?.releaseDate?.slice(0, 4) ?? null)
  const poster = kind === 'movie' ? (movie.data?.poster ?? null) : (episode?.image ?? series.data?.poster ?? null)

  const source = useAsync(
    () => streamUrl(credentials!, kind, streamId, extension),
    [credentials, kind, streamId, extension],
    { enabled: Boolean(credentials && streamId) },
  )
  const src = source.data ?? null

  const handleProgress = useCallback(
    (position: number, duration: number) => {
      if (!duration) return
      saveResume({
        kind,
        id: kind === 'series' ? (seriesId ?? streamId) : streamId,
        streamId,
        name: title,
        subtitle,
        poster,
        extension,
        position,
        duration,
      })
    },
    [kind, seriesId, streamId, title, subtitle, poster, extension],
  )

  const handleEnded = useCallback(() => {
    if (!settings.autoplayNext || !nextEpisode) return

    const params = new URLSearchParams({
      kind: 'series',
      id: nextEpisode.id,
      ext: nextEpisode.extension,
      series: seriesId ?? '',
      s: String(nextEpisode.season),
      e: String(nextEpisode.episodeNum),
    })
    router.replace(`/lecture?${params.toString()}`, { scroll: false })
  }, [settings.autoplayNext, nextEpisode, seriesId, router])

  const goBack = useCallback(() => {
    if (kind === 'series' && seriesId) router.push(`/series/${seriesId}`)
    else if (kind === 'movie') router.push(`/films/${streamId}`)
    else router.push('/accueil')
  }, [kind, seriesId, streamId, router])

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-ink-950">
        <Spinner className="size-8 text-gold-500" />
      </div>
    )
  }

  if (!credentials) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-ink-950 p-6">
        <EmptyState
          title="Session expirée"
          description="Reconnectez-vous à votre portail pour lancer la lecture."
          action={
            <LinkButton href="/" size="sm">
              Se connecter
            </LinkButton>
          }
        />
      </div>
    )
  }

  if (!streamId) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-ink-950 p-6">
        <EmptyState title="Aucun flux à lire" description="Le lien de lecture est incomplet." />
      </div>
    )
  }

  const unsupportedContainer = !BROWSER_FRIENDLY.has(extension.toLowerCase())

  return (
    <main className="flex min-h-dvh flex-col bg-ink-950">
      <div className="flex flex-1 items-center justify-center">
        <div className="w-full max-w-[1600px]">
          <VideoPlayer
            key={src}
            src={src}
            title={title}
            subtitle={subtitle}
            poster={poster}
            isHls={extension.toLowerCase() === 'm3u8'}
            startPosition={startPosition}
            onProgress={handleProgress}
            onEnded={handleEnded}
            onBack={goBack}
            className="sm:rounded-card"
          />
        </div>
      </div>

      <div className="space-y-3 px-4 pb-8 pt-4 sm:px-6">
        {movie.error || series.error ? (
          <ErrorMessage
            message={movie.error ?? series.error ?? ''}
            onRetry={kind === 'movie' ? movie.reload : series.reload}
          />
        ) : null}

        {unsupportedContainer ? (
          <p className="rounded-card border border-gold-500/30 bg-gold-500/10 px-4 py-3 text-sm text-gold-300">
            Ce fichier est au format <strong>.{extension}</strong>. Les navigateurs ne décodent pas
            tous les conteneurs (MKV, AVI) : si l’image reste noire, ouvrez le flux dans un lecteur
            externe comme VLC.
          </p>
        ) : null}

        {kind === 'series' && nextEpisode ? (
          <p className="text-sm text-ink-400">
            À suivre : <span className="text-ink-200">S{nextEpisode.season} E{nextEpisode.episodeNum}</span>{' '}
            — {nextEpisode.title}
            {settings.autoplayNext ? ' (lecture automatique activée)' : ''}
          </p>
        ) : null}

        {season !== null && episodeNum !== null ? (
          <p className="sr-only">
            Saison {season}, épisode {episodeNum}
          </p>
        ) : null}
      </div>
    </main>
  )
}

function findEpisode(series: SeriesDetail, episodeId: string): Episode | null {
  for (const list of Object.values(series.episodesBySeason)) {
    const found = list.find((episode) => episode.id === episodeId)
    if (found) return found
  }
  return null
}
