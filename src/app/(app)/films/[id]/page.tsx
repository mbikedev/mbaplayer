import type { Metadata } from 'next'
import { MovieDetailScreen } from '@/components/screens/movie-detail-screen'

export const metadata: Metadata = { title: 'Film' }

export default async function MovieDetailPage({ params }: PageProps<'/films/[id]'>) {
  const { id } = await params
  return <MovieDetailScreen movieId={id} />
}
