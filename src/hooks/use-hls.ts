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
): HlsState {
  const hlsRef = useRef<Hls | null>(null)
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
        manifestLoadingMaxRetry: 3,
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

        // Network and media errors are frequently transient on IPTV portals, so
        // recovery is attempted once per class before giving up.
        if (data.type === HlsClass.ErrorTypes.NETWORK_ERROR) {
          hls.startLoad()
          return
        }
        if (data.type === HlsClass.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError()
          return
        }
        setFatalError(
          'Lecture impossible : le flux est indisponible ou le format n’est pas supporté.',
        )
        hls.destroy()
        hlsRef.current = null
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
