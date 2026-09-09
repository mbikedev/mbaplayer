import type { Metadata } from 'next'
import { MoviesScreen } from '@/components/screens/movies-screen'

export const metadata: Metadata = { title: 'Films' }

export default function MoviesPage() {
  return <MoviesScreen />
}
