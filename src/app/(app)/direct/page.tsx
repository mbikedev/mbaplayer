import type { Metadata } from 'next'
import { LiveScreen } from '@/components/screens/live-screen'

export const metadata: Metadata = { title: 'Direct' }

export default async function LivePage({ searchParams }: PageProps<'/direct'>) {
  const params = await searchParams
  const raw = params.channel
  const channelId = Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '')
  return <LiveScreen initialChannelId={channelId || null} />
}
