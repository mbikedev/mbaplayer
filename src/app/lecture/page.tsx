import type { Metadata } from 'next'
import { PlaybackScreen } from '@/components/screens/playback-screen'

export const metadata: Metadata = { title: 'Lecture' }

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ''
  return value ?? ''
}

export default async function PlaybackPage({ searchParams }: PageProps<'/lecture'>) {
  const params = await searchParams

  return (
    <PlaybackScreen
      kind={first(params.kind) === 'series' ? 'series' : 'movie'}
      streamId={first(params.id)}
      extension={first(params.ext) || 'mp4'}
      startPosition={Number(first(params.t)) || 0}
      seriesId={first(params.series) || null}
      season={Number(first(params.s)) || null}
      episodeNum={Number(first(params.e)) || null}
    />
  )
}
