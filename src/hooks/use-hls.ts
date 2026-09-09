'use client'

import { useEffect, useRef, useState } from 'react'
import type Hls from 'hls.js'
import type { ErrorData, Level } from 'hls.js'

export interface QualityLevel {
  index: number
  label: string
  height: number
  bitrate: number
}

export interface AudioTrackOption {
  index: number
  label: string
}

export interface HlsState {
  levels: QualityLevel[]
  currentLevel: number
  setLevel: (index: number) => void
  audioTracks: AudioTrackOption[]
  currentAudioTrack: number
  setAudioTrack: (index: number) => void
  fatalError: string | null
  retry: () => void
}

/**
 * How many times a fatal error of each kind is worth recovering from before
 * the stream is called dead.
 *
 * IPTV portals drop connections often enough that an immediate give-up would
 * be wrong, but retrying without a limit is worse: a URL the portal does not
 * serve at all — a catch-up recording in a shape this panel does not use, say —
 * would reload forever behind a spinner that never resolves.
 */
const MAX_NETWORK_RECOVERIES = 3
const MAX_MEDIA_RECOVERIES = 2

function levelLabel(level: Level): string {
  if (level.height) return `${level.height}p`
  if (level.bitrate) return `${Math.round(level.bitrate / 1000)} kbps`
  return 'Auto'
}

/**
 * Attaches a source to a <video>, using hls.js for playlists and the element's
 * own loader for progressive files.
 *
 * hls.js is imported lazily: it is ~200 KB and pointless on Safari and iOS,
 * where HLS plays natively and Media Source Extensions are unavailable.
 */
export function useHls(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  src: string | null,
  isHls: boolean,
  options: { onUnplayable?: (message: string) => void } = {},
): HlsState {
  const hlsRef = useRef<Hls | null>(null)
  const recoveries = useRef({ network: 0, media: 0 })

  // Kept in a ref so a caller passing an inline callback does not tear down and
  // rebuild the whole hls.js instance on every render.
  const onUnplayableRef = useRef(options.onUnplayable)
  useEffect(() => {
    onUnplayableRef.current = options.onUnplayable
  }, [options.onUnplayable])
  const [levels, setLevels] = useState<QualityLevel[]>([])
  const [currentLevel, setCurrentLevel] = useState(-1)
  const [audioTracks, setAudioTracks] = useState<AudioTrackOption[]>([])
  const [currentAudioTrack, setCurrentAudioTrack] = useState(-1)
  const [fatalError, setFatalError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const video = videoRef.current
    if (!video || !src) return

    let cancelled = false
    recoveries.current = { network: 0, media: 0 }
    setFatalError(null)
    setLevels([])
    setAudioTracks([])
    setCurrentLevel(-1)
    setCurrentAudioTrack(-1)

    async function attach() {
      if (!video) return

      if (!isHls) {
        video.src = src!
        return
      }

      // Safari and iOS play HLS natively and do not expose MSE, so hls.js is
      // both unnecessary and unusable there.
      const nativeHls = video.canPlayType('application/vnd.apple.mpegurl')
      const { default: HlsClass } = await import('hls.js')
      if (cancelled) return

      if (!HlsClass.isSupported()) {
        if (nativeHls) {
          video.src = src!
        } else {
          setFatalError("Ce navigateur ne sait pas lire les flux HLS.")
        }
        return
      }

      const hls = new HlsClass({
        // Live channels should start close to the edge; a large back buffer
        // only wastes memory on a stream nobody rewinds.
        lowLatencyMode: false,
        backBufferLength: 30,
        maxBufferLength: 30,
        manifestLoadingTimeOut: 20_000,
        // Deliberately low. A playlist that does not load is usually the wrong
        // URL rather than a blip, and every internal retry is time the viewer
        // spends watching a spinner before an alternative can be tried.
        manifestLoadingMaxRetry: 1,
        fragLoadingTimeOut: 30_000,
        fragLoadingMaxRetry: 4,
      })
      hlsRef.current = hls

      hls.on(HlsClass.Events.MANIFEST_PARSED, (_event, data) => {
        if (cancelled) return
        setLevels(
          data.levels.map((level, index) => ({
            index,
            label: levelLabel(level),
            height: level.height ?? 0,
            bitrate: level.bitrate ?? 0,
          })),
        )
        video.play().catch(() => {
          // Autoplay with sound is blocked until the user interacts; the
          // controls stay visible so they can start it themselves.
        })
      })

      hls.on(HlsClass.Events.LEVEL_SWITCHED, (_event, data) => {
        if (!cancelled) setCurrentLevel(hls.autoLevelEnabled ? -1 : data.level)
      })

      hls.on(HlsClass.Events.AUDIO_TRACKS_UPDATED, (_event, data) => {
        if (cancelled) return
        setAudioTracks(
          data.audioTracks.map((track, index) => ({
            index,
            label: track.name || track.lang || `Piste ${index + 1}`,
          })),
        )
        setCurrentAudioTrack(hls.audioTrack)
      })

      hls.on(HlsClass.Events.ERROR, (_event, data: ErrorData) => {
        if (cancelled || !data.fatal) return

        // A 4xx on the playlist itself is the portal answering definitively:
        // the URL is wrong or the account may not have it, and no amount of
        // retrying changes that. Reporting it straight away is what lets the
        // caller try another URL shape within a second rather than a minute.
        const status = data.response?.code
        const isPlaylistLoad =
          data.details === HlsClass.ErrorDetails.MANIFEST_LOAD_ERROR ||
          data.details === HlsClass.ErrorDetails.MANIFEST_PARSING_ERROR ||
          data.details === HlsClass.ErrorDetails.LEVEL_LOAD_ERROR
        const answeredDefinitively =
          isPlaylistLoad && typeof status === 'number' && status >= 400 && status < 500

        // Network and media errors are otherwise frequently transient on IPTV
        // portals, so recovery is worth attempting — a bounded number of times.
        if (
          !answeredDefinitively &&
          data.type === HlsClass.ErrorTypes.NETWORK_ERROR &&
          recoveries.current.network < MAX_NETWORK_RECOVERIES
        ) {
          recoveries.current.network += 1
          hls.startLoad()
          return
        }
        if (
          data.type === HlsClass.ErrorTypes.MEDIA_ERROR &&
          recoveries.current.media < MAX_MEDIA_RECOVERIES
        ) {
          recoveries.current.media += 1
          hls.recoverMediaError()
          return
        }

        const message = answeredDefinitively
          ? `Le portail ne fournit pas ce contenu (erreur ${status}).`
          : data.type === HlsClass.ErrorTypes.NETWORK_ERROR
            ? 'Flux injoignable : le portail ne répond pas pour ce contenu.'
            : 'Lecture impossible : le flux est indisponible ou le format n’est pas supporté.'

        setFatalError(message)
        hls.destroy()
        hlsRef.current = null

        // Lets the caller try another URL for the same content before the
        // error is shown as final — catch-up in particular has more than one
        // possible URL shape.
        onUnplayableRef.current?.(message)
      })

      hls.loadSource(src!)
      hls.attachMedia(video)
    }

    attach()

    return () => {
      cancelled = true
      hlsRef.current?.destroy()
      hlsRef.current = null
      if (video) {
        video.removeAttribute('src')
        video.load()
      }
    }
  }, [videoRef, src, isHls, attempt])

  return {
    levels,
    currentLevel,
    setLevel: (index) => {
      const hls = hlsRef.current
      if (!hls) return
      hls.currentLevel = index
      setCurrentLevel(index)
    },
    audioTracks,
    currentAudioTrack,
    setAudioTrack: (index) => {
      const hls = hlsRef.current
      if (!hls) return
      hls.audioTrack = index
      setCurrentAudioTrack(index)
    },
    fatalError,
    retry: () => setAttempt((value) => value + 1),
  }
}
