import type { Metadata } from 'next'
import { HomeScreen } from '@/components/screens/home-screen'

export const metadata: Metadata = { title: 'Accueil' }

export default function HomePage() {
  return <HomeScreen />
}
