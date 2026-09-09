import type { Metadata } from 'next'
import { LiveScreen } from '@/components/screens/live-screen'

export const metadata: Metadata = { title: 'Direct' }

export default function LivePage() {
  return <LiveScreen />
}
