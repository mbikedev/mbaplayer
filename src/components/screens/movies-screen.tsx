'use client'

import { CatalogBrowser } from '../catalog-browser'
import { getMovieCategories, getMovies } from '@/lib/catalog'

export function MoviesScreen() {
  return (
    <CatalogBrowser
      title="Films"
      loadCategories={getMovieCategories}
      loadItems={getMovies}
      hrefFor={(movie) => `/films/${movie.id}`}
      emptyTitle="Aucun film"
      emptyDescription="Ce portail ne propose pas de vidéothèque, ou votre abonnement n’y donne pas accès."
    />
  )
}
