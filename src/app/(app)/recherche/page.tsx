import type { Metadata } from 'next'
import { SearchScreen } from '@/components/screens/search-screen'

export const metadata: Metadata = { title: 'Recherche' }

export default async function SearchPage({ searchParams }: PageProps<'/recherche'>) {
  const params = await searchParams
  const raw = params.q
  const query = Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '')
  return <SearchScreen query={query} />
}
