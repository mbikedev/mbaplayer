'use client'

import { useMemo, useState } from 'react'
import { useSession } from '@/context/session'
import { useAsync } from '@/hooks/use-async'
import { searchable } from '@/lib/format'
import { isAdultCategoryName } from '@/lib/storage'
import type { Category } from '@/lib/xtream-types'
import { LoadMoreSentinel, useInfiniteWindow } from './infinite-list'
import { PosterCard, PosterGrid } from './poster-card'
import { Button, EmptyState, ErrorMessage, GridSkeleton, PageHeader, cx } from './ui'
import { RefreshIcon, SearchIcon } from './icons'
import type { Credentials } from '@/lib/credentials'

export interface CatalogItem {
  id: string
  name: string
  poster: string | null
  rating: number | null
  categoryId: string
}

interface CatalogBrowserProps<T extends CatalogItem> {
  title: string
  loadCategories: (credentials: Credentials) => Promise<Category[]>
  loadItems: (credentials: Credentials) => Promise<T[]>
  hrefFor: (item: T) => string
  emptyTitle: string
  emptyDescription: string
}

/** Rendered in slices so a 40 000-entry catalogue does not build 40 000 nodes. */
const PAGE_SIZE = 60

/**
 * Shared catalogue screen for films and series.
 *
 * The full list is fetched once and filtered in the browser rather than
 * re-querying per category: portals answer `get_vod_streams` without a category
 * just as happily, and it makes category switching and search instant.
 */
export function CatalogBrowser<T extends CatalogItem>({
  title,
  loadCategories,
  loadItems,
  hrefFor,
  emptyTitle,
  emptyDescription,
}: CatalogBrowserProps<T>) {
  const { credentials, settings } = useSession()
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [query, setQuery] = useState('')

  const categories = useAsync(
    () => loadCategories(credentials!),
    [credentials],
    { enabled: Boolean(credentials) },
  )

  const items = useAsync(() => loadItems(credentials!), [credentials], {
    enabled: Boolean(credentials),
  })

  const hiddenCategoryIds = useMemo(() => {
    if (!settings.hideAdult) return new Set<string>()
    return new Set(
      (categories.data ?? []).filter((c) => isAdultCategoryName(c.name)).map((c) => c.id),
    )
  }, [categories.data, settings.hideAdult])

  const visibleCategories = useMemo(
    () => (categories.data ?? []).filter((c) => !hiddenCategoryIds.has(c.id)),
    [categories.data, hiddenCategoryIds],
  )

  const filtered = useMemo(() => {
    const all = items.data ?? []
    const needle = searchable(query.trim())
    return all.filter((item) => {
      if (hiddenCategoryIds.has(item.categoryId)) return false
      if (activeCategory !== 'all' && item.categoryId !== activeCategory) return false
      if (needle && !searchable(item.name).includes(needle)) return false
      return true
    })
  }, [items.data, query, activeCategory, hiddenCategoryIds])

  const categoryName =
    activeCategory === 'all'
      ? 'Toutes les catégories'
      : (visibleCategories.find((c) => c.id === activeCategory)?.name ?? '')

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        subtitle={
          items.data
            ? `${filtered.length.toLocaleString('fr-FR')} titre${filtered.length > 1 ? 's' : ''} · ${categoryName}`
            : undefined
        }
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              categories.reload()
              items.reload()
            }}
          >
            <RefreshIcon className="size-4" />
            Actualiser
          </Button>
        }
      />

      <div className="relative max-w-md">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Filtrer dans ${title.toLowerCase()}…`}
          aria-label={`Filtrer dans ${title.toLowerCase()}`}
          className="h-10 w-full rounded-lg border border-ink-700 bg-ink-900 pl-9 pr-3 text-sm text-ink-50 placeholder:text-ink-400 focus:border-gold-500 focus:outline-none"
        />
      </div>

      {/* Horizontal category rail — scrolls on phones, wraps on desktop. */}
      {visibleCategories.length > 0 ? (
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          <CategoryChip
            label="Tout"
            active={activeCategory === 'all'}
            onClick={() => setActiveCategory('all')}
          />
          {visibleCategories.map((category) => (
            <CategoryChip
              key={category.id}
              label={category.name}
              active={activeCategory === category.id}
              onClick={() => setActiveCategory(category.id)}
            />
          ))}
        </div>
      ) : null}

      {items.error ? <ErrorMessage message={items.error} onRetry={items.reload} /> : null}

      {items.loading ? (
        <GridSkeleton />
      ) : filtered.length > 0 ? (
        // Keyed by the active filters: changing one remounts the window so the
        // grid starts at the first page again.
        <WindowedGrid key={`${activeCategory}|${query}`} items={filtered} hrefFor={hrefFor} />
      ) : items.error ? null : (
        <EmptyState
          title={query ? 'Aucun résultat' : emptyTitle}
          description={query ? `Rien ne correspond à « ${query} ».` : emptyDescription}
        />
      )}
    </div>
  )
}

function WindowedGrid<T extends CatalogItem>({
  items,
  hrefFor,
}: {
  items: T[]
  hrefFor: (item: T) => string
}) {
  const { shown, hasMore, sentinelRef } = useInfiniteWindow(items, PAGE_SIZE)

  return (
    <>
      <PosterGrid>
        {shown.map((item) => (
          <PosterCard
            key={item.id}
            href={hrefFor(item)}
            title={item.name}
            poster={item.poster}
            rating={item.rating}
          />
        ))}
      </PosterGrid>
      {hasMore ? <LoadMoreSentinel ref={sentinelRef} /> : null}
    </>
  )
}

function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm transition-colors',
        active
          ? 'border-gold-500 bg-gold-500/15 text-gold-300'
          : 'border-ink-700 bg-ink-900 text-ink-300 hover:border-ink-600 hover:text-ink-100',
      )}
    >
      {label}
    </button>
  )
}
