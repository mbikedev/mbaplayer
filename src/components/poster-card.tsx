'use client'

import Link from 'next/link'
import { formatRating, progressPercent } from '@/lib/format'
import { cx } from './ui'
import { PlayIcon, StarFilledIcon } from './icons'

export interface PosterCardProps {
  href: string
  title: string
  poster: string | null
  rating?: number | null
  subtitle?: string | null
  /** Seconds already watched, for the resume bar. */
  progress?: { position: number; duration: number } | null
}

/**
 * Poster tile used by the film and series grids.
 *
 * Portal artwork is unreliable — dead links, hotlink protection, mixed content
 * — so a text-only fallback is rendered underneath and revealed by hiding the
 * broken <img>, rather than leaving a torn image icon.
 */
export function PosterCard({ href, title, poster, rating, subtitle, progress }: PosterCardProps) {
  const ratingLabel = formatRating(rating ?? null)
  const percent = progress ? progressPercent(progress.position, progress.duration) : 0

  return (
    <Link
      href={href}
      className="group flex flex-col gap-2 rounded-card focus-visible:outline-none"
      title={title}
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-card bg-ink-850 ring-1 ring-ink-800 transition-all group-hover:ring-gold-500/50 group-focus-visible:ring-2 group-focus-visible:ring-gold-500">
        <span className="absolute inset-0 flex items-center justify-center p-3 text-center text-xs font-medium text-ink-400">
          {title}
        </span>

        {poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={poster}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={(event) => {
              event.currentTarget.style.display = 'none'
            }}
            className="relative size-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
          />
        ) : null}

        <span className="absolute inset-0 bg-gradient-to-t from-ink-950/80 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

        <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
          <span className="flex size-12 items-center justify-center rounded-full bg-gold-500/90 text-ink-950">
            <PlayIcon className="size-6" />
          </span>
        </span>

        {ratingLabel ? (
          <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-ink-950/80 px-2 py-0.5 text-[11px] font-medium text-gold-300 backdrop-blur-sm">
            <StarFilledIcon className="size-3" />
            {ratingLabel}
          </span>
        ) : null}

        {percent > 0 ? (
          <span className="absolute inset-x-0 bottom-0 h-1 bg-ink-950/70">
            <span className="block h-full bg-gold-500" style={{ width: `${percent}%` }} />
          </span>
        ) : null}
      </div>

      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink-100 group-hover:text-gold-300">{title}</p>
        {subtitle ? <p className="truncate text-xs text-ink-400">{subtitle}</p> : null}
      </div>
    </Link>
  )
}

/** Responsive poster grid used by every catalogue screen. */
export function PosterGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        'grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6',
        className,
      )}
    >
      {children}
    </div>
  )
}
