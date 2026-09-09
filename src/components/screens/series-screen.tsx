'use client'

import { CatalogBrowser } from '../catalog-browser'
import { getSeries, getSeriesCategories } from '@/lib/xtream'

export function SeriesScreen() {
  return (
    <CatalogBrowser
      title="Séries"
      loadCategories={getSeriesCategories}
      loadItems={getSeries}
      hrefFor={(series) => `/series/${series.id}`}
      emptyTitle="Aucune série"
      emptyDescription="Ce portail ne propose pas de séries, ou votre abonnement n’y donne pas accès."
    />
  )
}
