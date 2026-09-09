import type { Metadata } from 'next'
import { GuideScreen } from '@/components/screens/guide-screen'

export const metadata: Metadata = { title: 'Guide TV' }

export default function GuidePage() {
  return <GuideScreen />
}
