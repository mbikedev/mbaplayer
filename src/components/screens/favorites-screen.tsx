'use client'

import { useState } from 'react'
import { toggleFavorite, useFavorites, type ContentKind, type FavoriteItem } from '@/lib/storage'
import { PosterCard, PosterGrid } from '../poster-card'
import { EmptyState, LinkButton, PageHeader, cx } from '../ui'

const TABS: Array<{ id: ContentKind | 'all'; label: string }> = [
  { id: 'all', label: 'Tout' },
  { id: 'live', label: 'Chaînes' },
  { id: 'movie', label: 'Films' },
  { id: 'series', label: 'Séries' },
]

export function FavoritesScreen() {
  const favorites = useFavorites()
  const [tab, setTab] = useState<ContentKind | 'all'>('all')

  const shown = tab === 'all' ? favorites : favorites.filter((item) => item.kind === tab)

  function remove(item: FavoriteItem) {
    toggleFavorite(item)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Favoris"
        subtitle={`${favorites.length} élément${favorites.length > 1 ? 's' : ''} enregistré${favorites.length > 1 ? 's' : ''} sur cet appareil`}
      />

      <div className="flex flex-wrap gap-2">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            aria-pressed={tab === entry.id}
            className={cx(
              'rounded-full border px-3.5 py-1.5 text-sm transition-colors',
              tab === entry.id
                ? 'border-gold-500 bg-gold-500/15 text-gold-300'
                : 'border-ink-700 bg-ink-900 text-ink-300 hover:border-ink-600 hover:text-ink-100',
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {shown.length > 0 ? (
        <PosterGrid>
          {shown.map((item) => (
            <div key={item.key} className="space-y-1.5">
              <PosterCard
                href={hrefFor(item)}
                title={item.name}
                poster={item.poster}
                subtitle={kindLabel(item.kind)}
              />
              <button
                type="button"
                onClick={() => remove(item)}
                className="text-xs text-ink-400 transition-colors hover:text-danger-500"
              >
                Retirer des favoris
              </button>
            </div>
          ))}
        </PosterGrid>
      ) : (
        <EmptyState
          title="Aucun favori"
          description="Les chaînes, films et séries que vous marquez apparaissent ici."
          action={
            <LinkButton href="/direct" size="sm" variant="secondary">
              Parcourir les chaînes
            </LinkButton>
          }
        />
      )}
    </div>
  )
}

function kindLabel(kind: ContentKind): string {
  return kind === 'live' ? 'Chaîne' : kind === 'movie' ? 'Film' : 'Série'
}

function hrefFor(item: FavoriteItem): string {
  if (item.kind === 'movie') return `/films/${item.id}`
  if (item.kind === 'series') return `/series/${item.id}`
  return '/direct'
}
