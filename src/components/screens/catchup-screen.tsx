'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/context/session'
import { useAsync } from '@/hooks/use-async'
import { formatTime } from '@/lib/format'
import { VIEWER_CLOCK } from '@/lib/catchup'
import { catchupStreamUrls, getPortalClock } from '@/lib/xtream'
import { VideoPlayer } from '../video-player'
import { EmptyState, LinkButton, Spinner } from '../ui'

interface CatchupScreenProps {
  channelId: string
  channelName: string
  title: string
  /** Programme start as a UTC instant, in milliseconds. */
  start: number
  durationMinutes: number
}

/**
 * Plays a past programme from the portal's recording.
 *
 * Separate from /lecture because the inputs are different in kind: there is no
 * catalogue entry to look up, only a channel and a time range, and the URL has
 * to be guessed from more than one candidate shape.
 */
export function CatchupScreen({
  channelId,
  channelName,
  title,
  start,
  durationMinutes,
}: CatchupScreenProps) {
  const router = useRouter()
  const { credentials, ready } = useSession()

  // Panels disagree on the timeshift URL shape and only the portal knows which
  // it serves, so the candidates are tried in turn.
  const [candidateIndex, setCandidateIndex] = useState(0)

  const clock = useAsync(() => getPortalClock(credentials!), [credentials], {
    enabled: Boolean(credentials),
  })

  const sources = useMemo(() => {
    if (!credentials || !channelId || !start || !durationMinutes) return []
    // Falling back to the viewer's clock is better than not playing at all: it
    // is correct whenever the portal runs in the viewer's timezone.
    return catchupStreamUrls(
      credentials,
      clock.data ?? VIEWER_CLOCK,
      channelId,
      start,
      durationMinutes,
    )
  }, [credentials, clock.data, channelId, start, durationMinutes])

  const handleUnplayable = useCallback(() => {
    setCandidateIndex((index) => (index + 1 < sources.length ? index + 1 : index))
  }, [sources.length])

  const goBack = useCallback(() => router.push('/guide'), [router])

  if (!ready || (credentials && clock.loading)) {
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
          description="Reconnectez-vous à votre portail pour lancer le rattrapage."
          action={
            <LinkButton href="/" size="sm">
              Se connecter
            </LinkButton>
          }
        />
      </div>
    )
  }

  if (sources.length === 0) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-ink-950 p-6">
        <EmptyState
          title="Programme introuvable"
          description="Le lien de rattrapage est incomplet."
          action={
            <LinkButton href="/guide" size="sm" variant="secondary">
              Retour au guide
            </LinkButton>
          }
        />
      </div>
    )
  }

  const end = start + durationMinutes * 60_000
  const subtitle = `${channelName || 'Rattrapage'} · ${formatTime(start)} – ${formatTime(end)}`

  return (
    <main className="flex min-h-dvh flex-col bg-ink-950">
      <div className="flex flex-1 items-center justify-center">
        <div className="w-full max-w-[1600px]">
          <VideoPlayer
            key={sources[candidateIndex]}
            src={sources[candidateIndex]}
            title={title || channelName || 'Rattrapage'}
            subtitle={subtitle}
            // A recording is a finite stream, so it seeks like a film rather
            // than behaving as live.
            isHls={isHlsCandidate(candidateIndex)}
            onUnplayable={handleUnplayable}
            onBack={goBack}
            className="sm:rounded-card"
          />
        </div>
      </div>

      <div className="space-y-3 px-4 pb-8 pt-4 sm:px-6">
        <p className="text-sm text-ink-400">
          Rattrapage — enregistrement fourni par le portail. Sa disponibilité et sa qualité
          dépendent entièrement de celui-ci.
        </p>

        {candidateIndex > 0 ? (
          <p className="rounded-card border border-gold-500/30 bg-gold-500/10 px-4 py-3 text-sm text-gold-300">
            La première adresse de rattrapage n’a rien renvoyé ; une autre forme d’URL est en cours
            d’essai. Certains portails répondent ici en MPEG-TS, que les navigateurs ne lisent pas.
          </p>
        ) : null}
      </div>
    </main>
  )
}

/**
 * Only the first candidate is an HLS playlist; the legacy `timeshift.php`
 * fallback is served as a progressive stream.
 */
function isHlsCandidate(index: number): boolean {
  return index === 0
}
