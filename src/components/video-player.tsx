'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useHls } from '@/hooks/use-hls'
import { formatClock } from '@/lib/format'
import { Button, Spinner, cx } from './ui'
import {
  AlertIcon,
  ChevronLeftIcon,
  ExitFullscreenIcon,
  FullscreenIcon,
  MuteIcon,
  PauseIcon,
  PlayIcon,
  RefreshIcon,
  SettingsIcon,
  SkipIcon,
  VolumeIcon,
} from './icons'

export interface VideoPlayerProps {
  /** Proxied stream URL, or null while it is still being resolved. */
  src: string | null
  title: string
  subtitle?: string | null
  poster?: string | null
  /** Live streams hide the seek bar and show a LIVE badge instead. */
  live?: boolean
  isHls: boolean
  /** Seconds to resume from, applied once when playback becomes seekable. */
  startPosition?: number
  /**
   * Called when the source is judged dead after the bounded retries. Lets the
   * caller swap in another URL for the same content before the viewer is shown
   * a final error.
   */
  onUnplayable?: (message: string) => void
  onProgress?: (position: number, duration: number) => void
  onEnded?: () => void
  onBack?: () => void
  className?: string
}

const CONTROLS_HIDE_DELAY_MS = 3000

/**
 * How long the spinner may run before the source is declared dead.
 *
 * A stream that is merely slow announces itself: hls.js reports its errors and
 * the <video> element fires `error`. The case this covers is the silent one —
 * a stream id the panel accepts and then never feeds, which is what a group
 * banner in the channel list is. Nothing fails, so nothing was ever reported
 * and the spinner ran for ever. Generous enough for a congested portal on a
 * slow connection, short enough to stay an answer rather than a wait.
 */
const STALL_TIMEOUT_MS = 25_000
const SEEK_STEP_SECONDS = 10

export function VideoPlayer({
  src,
  title,
  subtitle,
  poster,
  live = false,
  isHls,
  startPosition = 0,
  onUnplayable,
  onProgress,
  onEnded,
  onBack,
  className,
}: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const resumeApplied = useRef(false)

  const [playing, setPlaying] = useState(false)
  const [waiting, setWaiting] = useState(true)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [idleHidden, setIdleHidden] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  /** Set once the source has produced a frame; the stall timer only guards the first one. */
  const [started, setStarted] = useState(false)

  /**
   * Errors raised by the <video> element itself, which hls.js never sees.
   * Progressive sources — a film, or a catch-up URL served as MPEG-TS — fail
   * here, and without this the player sat on its spinner for ever.
   */
  const [elementError, setElementError] = useState<string | null>(null)

  // The caller swaps in another URL when told the source is dead, so telling it
  // twice for the same source would skip a candidate.
  const reportedUnplayable = useRef(false)

  const hls = useHls(videoRef, src, isHls, { onUnplayable })

  const fatalError = hls.fatalError ?? elementError

  const reportUnplayable = useCallback(
    (message: string) => {
      setElementError(message)
      setWaiting(false)
      if (reportedUnplayable.current) return
      reportedUnplayable.current = true
      onUnplayable?.(message)
    },
    [onUnplayable],
  )

  const retry = useCallback(() => {
    setElementError(null)
    reportedUnplayable.current = false
    setStarted(false)
    setWaiting(true)
    hls.retry()
    videoRef.current?.load()
  }, [hls])

  // The chrome only ever hides during uninterrupted playback: a paused video or
  // an open menu keeps it on screen, so this is derived instead of tracked.
  const controlsVisible = !idleHidden || !playing || menuOpen

  const revealControls = useCallback(() => {
    setIdleHidden(false)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setIdleHidden(true), CONTROLS_HIDE_DELAY_MS)
  }, [])

  // Start the idle countdown when playback begins and no menu is open.
  useEffect(() => {
    if (!playing || menuOpen) return
    const timer = setTimeout(() => setIdleHidden(true), CONTROLS_HIDE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [playing, menuOpen])

  // Give up on a source that never starts. Re-armed per source, and dropped
  // for good once the first frame lands so mid-playback buffering is unaffected.
  useEffect(() => {
    if (!src || started || fatalError) return
    const timer = setTimeout(() => {
      reportUnplayable(
        'Le flux ne démarre pas. La chaîne est peut-être hors service, ou cette entrée est un simple intitulé de groupe sans flux.',
      )
    }, STALL_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [src, started, fatalError, reportUnplayable])

  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) video.play().catch(() => setWaiting(false))
    else video.pause()
  }, [])

  const seekBy = useCallback(
    (delta: number) => {
      const video = videoRef.current
      if (!video || live || !Number.isFinite(video.duration)) return
      video.currentTime = Math.min(Math.max(0, video.currentTime + delta), video.duration)
      revealControls()
    },
    [live, revealControls],
  )

  const changeVolume = useCallback(
    (next: number) => {
      const video = videoRef.current
      if (!video) return
      const clamped = Math.min(1, Math.max(0, next))
      video.volume = clamped
      video.muted = clamped === 0
      setVolume(clamped)
      setMuted(clamped === 0)
      revealControls()
    },
    [revealControls],
  )

  const toggleMute = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    video.muted = !video.muted
    setMuted(video.muted)
    revealControls()
  }, [revealControls])

  const toggleFullscreen = useCallback(async () => {
    const container = containerRef.current
    if (!container) return
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await container.requestFullscreen()
    } catch {
      // iPhone Safari has no element fullscreen; the video element's own
      // native fullscreen is the fallback there.
      const video = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null
      video?.webkitEnterFullscreen?.()
    }
  }, [])

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  // Keyboard shortcuts, ignored while the user is typing in a field.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return

      switch (event.key) {
        case ' ':
        case 'k':
          event.preventDefault()
          togglePlay()
          break
        case 'ArrowRight':
          seekBy(SEEK_STEP_SECONDS)
          break
        case 'ArrowLeft':
          seekBy(-SEEK_STEP_SECONDS)
          break
        case 'ArrowUp':
          event.preventDefault()
          changeVolume((videoRef.current?.volume ?? 0) + 0.1)
          break
        case 'ArrowDown':
          event.preventDefault()
          changeVolume((videoRef.current?.volume ?? 0) - 0.1)
          break
        case 'm':
          toggleMute()
          break
        case 'f':
          toggleFullscreen()
          break
        case 'Escape':
          if (!document.fullscreenElement) onBack?.()
          break
        default:
          return
      }
      revealControls()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [togglePlay, seekBy, changeVolume, toggleMute, toggleFullscreen, onBack, revealControls])

  // Progress is reported at most once a second: the parent persists it to
  // localStorage and `timeupdate` fires several times a second.
  const lastReport = useRef(0)

  function handleTimeUpdate() {
    const video = videoRef.current
    if (!video) return
    setPosition(video.currentTime)
    const now = Date.now()
    if (!live && now - lastReport.current > 1000) {
      lastReport.current = now
      onProgress?.(video.currentTime, video.duration || 0)
    }
  }

  function handleLoadedMetadata() {
    const video = videoRef.current
    if (!video) return
    setDuration(Number.isFinite(video.duration) ? video.duration : 0)

    if (!resumeApplied.current && startPosition > 5 && Number.isFinite(video.duration)) {
      resumeApplied.current = true
      video.currentTime = Math.min(startPosition, video.duration - 5)
    }
  }

  const hasSeekBar = !live && duration > 0
  const showBigPlay = !playing && !waiting && !fatalError

  return (
    <div
      ref={containerRef}
      onMouseMove={revealControls}
      onTouchStart={revealControls}
      className={cx(
        'group relative isolate aspect-video w-full overflow-hidden rounded-card bg-black',
        fullscreen && 'aspect-auto h-dvh rounded-none',
        !controlsVisible && playing && 'cursor-none',
        className,
      )}
    >
      <video
        ref={videoRef}
        poster={poster ?? undefined}
        playsInline
        preload="metadata"
        className="size-full bg-black object-contain"
        onClick={togglePlay}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onWaiting={() => setWaiting(true)}
        onPlaying={() => {
          setWaiting(false)
          setStarted(true)
        }}
        onCanPlay={() => {
          setWaiting(false)
          setStarted(true)
        }}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onVolumeChange={(event) => {
          setVolume(event.currentTarget.volume)
          setMuted(event.currentTarget.muted)
        }}
        onEnded={() => {
          setPlaying(false)
          onEnded?.()
        }}
        onError={() => reportUnplayable(describeMediaError(videoRef.current?.error))}
      />

      {/* Loading and error overlays */}
      {waiting && !fatalError ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Spinner className="size-12 text-gold-500" />
        </div>
      ) : null}

      {fatalError ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-ink-950/90 px-6 text-center">
          <AlertIcon className="size-10 text-danger-500" />
          <p className="max-w-md text-sm text-ink-100">{fatalError}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={retry}>
              <RefreshIcon className="size-4" />
              Réessayer
            </Button>
            {onBack ? (
              <Button size="sm" variant="ghost" onClick={onBack}>
                Retour
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {showBigPlay ? (
        <button
          type="button"
          onClick={togglePlay}
          aria-label="Lecture"
          className="absolute inset-0 flex items-center justify-center"
        >
          <span className="flex size-20 items-center justify-center rounded-full bg-gold-500/90 text-ink-950 transition-transform hover:scale-105">
            <PlayIcon className="ml-1 size-9" />
          </span>
        </button>
      ) : null}

      {/* Top bar */}
      <div
        className={cx(
          'pointer-events-none absolute inset-x-0 top-0 flex items-start gap-3 bg-gradient-to-b from-ink-950/90 to-transparent p-4 transition-opacity duration-200',
          controlsVisible ? 'opacity-100' : 'opacity-0',
        )}
      >
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="Retour"
            className="pointer-events-auto rounded-lg bg-ink-950/60 p-2 text-ink-100 transition-colors hover:bg-ink-800"
          >
            <ChevronLeftIcon className="size-5" />
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink-50 sm:text-base">{title}</p>
          {subtitle ? <p className="truncate text-xs text-ink-300">{subtitle}</p> : null}
        </div>
        {live ? (
          <span className="pointer-events-none flex items-center gap-1.5 rounded-full bg-danger-500/90 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
            <span className="size-1.5 animate-pulse rounded-full bg-white" />
            Direct
          </span>
        ) : null}
      </div>

      {/* Bottom controls */}
      <div
        className={cx(
          'absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-950/95 via-ink-950/70 to-transparent px-3 pb-3 pt-8 transition-opacity duration-200 sm:px-4',
          controlsVisible ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        {hasSeekBar ? (
          <div className="mb-2 flex items-center gap-3">
            <span className="w-12 shrink-0 text-right text-xs tabular-nums text-ink-300">
              {formatClock(position)}
            </span>
            <input
              type="range"
              min={0}
              max={duration}
              step={1}
              value={position}
              aria-label="Position de lecture"
              onChange={(event) => {
                const video = videoRef.current
                if (!video) return
                video.currentTime = Number(event.target.value)
                setPosition(Number(event.target.value))
              }}
              className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-ink-700 accent-[var(--color-gold-500)]"
              style={{
                background: `linear-gradient(to right, var(--color-gold-500) ${
                  (position / duration) * 100
                }%, var(--color-ink-700) ${(position / duration) * 100}%)`,
              }}
            />
            <span className="w-12 shrink-0 text-xs tabular-nums text-ink-300">
              {formatClock(duration)}
            </span>
          </div>
        ) : null}

        <div className="flex items-center gap-1 sm:gap-2">
          <ControlButton onClick={togglePlay} label={playing ? 'Pause' : 'Lecture'}>
            {playing ? <PauseIcon className="size-5" /> : <PlayIcon className="size-5" />}
          </ControlButton>

          {!live ? (
            <>
              <ControlButton onClick={() => seekBy(-SEEK_STEP_SECONDS)} label="Reculer de 10 secondes">
                <SkipIcon className="size-5 -scale-x-100" />
              </ControlButton>
              <ControlButton onClick={() => seekBy(SEEK_STEP_SECONDS)} label="Avancer de 10 secondes">
                <SkipIcon className="size-5" />
              </ControlButton>
            </>
          ) : null}

          <div className="group/volume flex items-center gap-1">
            <ControlButton onClick={toggleMute} label={muted ? 'Réactiver le son' : 'Couper le son'}>
              {muted || volume === 0 ? <MuteIcon className="size-5" /> : <VolumeIcon className="size-5" />}
            </ControlButton>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              aria-label="Volume"
              onChange={(event) => changeVolume(Number(event.target.value))}
              className="hidden h-1 w-20 cursor-pointer appearance-none rounded-full bg-ink-700 accent-[var(--color-gold-500)] sm:block"
            />
          </div>

          <span className="flex-1" />

          {hls.levels.length > 1 || hls.audioTracks.length > 1 ? (
            <div className="relative">
              <ControlButton onClick={() => setMenuOpen((open) => !open)} label="Réglages du flux" active={menuOpen}>
                <SettingsIcon className="size-5" />
              </ControlButton>

              {menuOpen ? (
                <div className="absolute bottom-full right-0 mb-2 w-52 overflow-hidden rounded-lg border border-ink-700 bg-ink-900/95 py-1 shadow-xl backdrop-blur-sm">
                  {hls.levels.length > 1 ? (
                    <>
                      <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                        Qualité
                      </p>
                      <MenuItem
                        label="Automatique"
                        selected={hls.currentLevel === -1}
                        onClick={() => hls.setLevel(-1)}
                      />
                      {hls.levels
                        .slice()
                        .sort((a, b) => b.height - a.height)
                        .map((level) => (
                          <MenuItem
                            key={level.index}
                            label={level.label}
                            selected={hls.currentLevel === level.index}
                            onClick={() => hls.setLevel(level.index)}
                          />
                        ))}
                    </>
                  ) : null}

                  {hls.audioTracks.length > 1 ? (
                    <>
                      <p className="mt-1 border-t border-ink-700 px-3 pb-1.5 pt-2 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                        Audio
                      </p>
                      {hls.audioTracks.map((track) => (
                        <MenuItem
                          key={track.index}
                          label={track.label}
                          selected={hls.currentAudioTrack === track.index}
                          onClick={() => hls.setAudioTrack(track.index)}
                        />
                      ))}
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          <ControlButton
            onClick={toggleFullscreen}
            label={fullscreen ? 'Quitter le plein écran' : 'Plein écran'}
          >
            {fullscreen ? <ExitFullscreenIcon className="size-5" /> : <FullscreenIcon className="size-5" />}
          </ControlButton>
        </div>
      </div>
    </div>
  )
}

/** Turns the element's MediaError code into something worth reading. */
function describeMediaError(error: MediaError | null | undefined): string {
  switch (error?.code) {
    case MediaError.MEDIA_ERR_NETWORK:
      return 'Flux injoignable : le portail a interrompu le transfert.'
    case MediaError.MEDIA_ERR_DECODE:
      // Overwhelmingly H.265 on an FHD or 4K entry: the stream arrived and the
      // decoder refused it, which is the one failure a codec explains.
      return 'Flux illisible : le navigateur n’a pas pu décoder cette vidéo. Les variantes FHD et 4K sont souvent en H.265, que Chrome ne décode pas ici — Safari, lui, y arrive.'
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return 'Format non supporté par le navigateur — le portail renvoie peut-être du MPEG-TS.'
    default:
      return 'Lecture impossible : le flux est indisponible.'
  }
}

function ControlButton({
  onClick,
  label,
  children,
  active = false,
}: {
  onClick: () => void
  label: string
  children: React.ReactNode
  active?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cx(
        'rounded-lg p-2 transition-colors',
        active ? 'bg-ink-800 text-gold-400' : 'text-ink-100 hover:bg-ink-800 hover:text-gold-300',
      )}
    >
      {children}
    </button>
  )
}

function MenuItem({
  label,
  selected,
  onClick,
}: {
  label: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors',
        selected ? 'text-gold-400' : 'text-ink-200 hover:bg-ink-800',
      )}
    >
      {label}
      {selected ? <span className="size-1.5 rounded-full bg-gold-500" /> : null}
    </button>
  )
}
