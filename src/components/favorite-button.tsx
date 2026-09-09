'use client'

import { toggleFavorite, useIsFavorite, type ContentKind } from '@/lib/storage'
import { Button } from './ui'
import { StarFilledIcon, StarIcon } from './icons'

interface FavoriteButtonProps {
  kind: ContentKind
  id: string
  name: string
  poster: string | null
  size?: 'sm' | 'md' | 'lg'
}

export function FavoriteButton({ kind, id, name, poster, size = 'md' }: FavoriteButtonProps) {
  const active = useIsFavorite(kind, id)

  return (
    <Button
      variant="secondary"
      size={size}
      aria-pressed={active}
      onClick={() => toggleFavorite({ kind, id, name, poster })}
    >
      {active ? (
        <StarFilledIcon className="size-4 text-gold-400" />
      ) : (
        <StarIcon className="size-4" />
      )}
      {active ? 'En favori' : 'Ajouter aux favoris'}
    </Button>
  )
}
