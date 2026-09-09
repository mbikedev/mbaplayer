import type { Metadata } from 'next'
import { FavoritesScreen } from '@/components/screens/favorites-screen'

export const metadata: Metadata = { title: 'Favoris' }

export default function FavoritesPage() {
  return <FavoritesScreen />
}
