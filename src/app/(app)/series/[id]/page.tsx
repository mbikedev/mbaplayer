import type { Metadata } from 'next'
import { SeriesDetailScreen } from '@/components/screens/series-detail-screen'

export const metadata: Metadata = { title: 'Série' }

export default async function SeriesDetailPage({ params }: PageProps<'/series/[id]'>) {
  const { id } = await params
  return <SeriesDetailScreen seriesId={id} />
}
