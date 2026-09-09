import type { Metadata } from 'next'
import { CatchupScreen } from '@/components/screens/catchup-screen'

export const metadata: Metadata = { title: 'Rattrapage' }

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ''
  return value ?? ''
}

export default async function CatchupPage({ searchParams }: PageProps<'/rattrapage'>) {
  const params = await searchParams

  return (
    <CatchupScreen
      channelId={first(params.channel)}
      channelName={first(params.name)}
      title={first(params.title)}
      start={Number(first(params.start)) || 0}
      durationMinutes={Number(first(params.dur)) || 0}
    />
  )
}
