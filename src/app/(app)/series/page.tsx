import type { Metadata } from 'next'
import { SeriesScreen } from '@/components/screens/series-screen'

export const metadata: Metadata = { title: 'Séries' }

export default function SeriesPage() {
  return <SeriesScreen />
}
