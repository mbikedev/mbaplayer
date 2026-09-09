'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSession } from '@/context/session'
import { useAsync } from '@/hooks/use-async'
import { useNow } from '@/hooks/use-now'
import { programmeMinutes, replayStatus } from '@/lib/catchup'
import { dayWindow } from '@/lib/epg-layout'
import { formatTime, searchable } from '@/lib/format'
import { isAdultCategoryName } from '@/lib/storage'
import { getLiveCategories, getLiveChannels, supportsGuide } from '@/lib/catalog'
import { EpgGrid, type EpgSelection } from '../epg-grid'
import { ReplayIcon, SearchIcon } from '../icons'
import { Badge, Button, EmptyState, ErrorMessage, LinkButton, PageHeader, Spinner, cx } from '../ui'

/** Days offered in the day picker, relative to today. */
const DAY_OFFSETS = [-2, -1, 0, 1, 2, 3, 4]

const ZOOM_LEVELS = [
  { pxPerMinute: 2, label: 'Large' },
  { pxPerMinute: 4, label: 'Normal' },
  { pxPerMinute: 7, label: 'Détaillé' },
] as const

export function GuideScreen() {
  const { credentials, settings } = useSession()
  const now = useNow()

  const [dayOffset, setDayOffset] = useState(0)
  const [pxPerMinute, setPxPerMinute] = useState<number>(4)
  const [activeCategory, setActiveCategory] = useState('all')
  const [query, setQuery] = useState('')
  const [selection, setSelection] = useState<EpgSelection | null>(null)

  // A playlist declares an XMLTV address at best; parsing that is a separate
  // job the app does not do yet, so the screen explains rather than showing an
  // empty grid the user would read as a bug.
  const guideAvailable = credentials ? supportsGuide(credentials) : true

  const categories = useAsync(() => getLiveCategories(credentials!), [credentials], {
    enabled: Boolean(credentials) && guideAvailable,
  })
  const channels = useAsync(() => getLiveChannels(credentials!), [credentials], {
    enabled: Boolean(credentials) && guideAvailable,
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
    const all = channels.data ?? []
    const needle = searchable(query.trim())
    return all.filter((channel) => {
      if (hiddenCategoryIds.has(channel.categoryId)) return false
      if (activeCategory !== 'all' && channel.categoryId !== activeCategory) return false
      if (needle && !searchable(channel.name).includes(needle)) return false
      return true
    })
  }, [channels.data, query, activeCategory, hiddenCategoryIds])

  // The window is derived from a ticking clock, so the guide rolls over to the
  // next day on its own rather than getting stuck on the day it was opened.
  const timeWindow = useMemo(() => dayWindow(dayOffset, now), [dayOffset, now])

  // `useNow` has no server snapshot — a clock read during render would be
  // impure — so the whole screen waits one frame for the client's time rather
  // than briefly labelling every day from the epoch.
  if (!guideAvailable) {
    return (
      <div className="space-y-6">
        <PageHeader title="Guide TV" />
        <EmptyState
          title="Pas de guide avec une playlist M3U"
          description="Une playlist ne contient que des chaînes et des liens, sans grille de programmes. Le guide demande l’API Xtream Codes — demandez à votre fournisseur s’il propose des identifiants API."
          action={
            <LinkButton href="/direct" size="sm" variant="secondary">
              Aller à la TV en direct
            </LinkButton>
          }
        />
      </div>
    )
  }

  if (!now) {
    return (
      <div className="space-y-6">
        <PageHeader title="Guide TV" />
        <div className="flex h-64 items-center justify-center rounded-card border border-ink-800 bg-ink-900">
          <Spinner className="size-8 text-gold-500" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Guide TV"
        subtitle={
          channels.data
            ? `${filtered.length.toLocaleString('fr-FR')} chaîne${filtered.length > 1 ? 's' : ''}`
            : undefined
        }
        actions={
          <div className="flex items-center gap-1 rounded-lg border border-ink-700 bg-ink-900 p-1">
            {ZOOM_LEVELS.map((level) => (
              <button
                key={level.pxPerMinute}
                type="button"
                onClick={() => setPxPerMinute(level.pxPerMinute)}
                aria-pressed={pxPerMinute === level.pxPerMinute}
                className={cx(
                  'rounded px-2.5 py-1 text-xs transition-colors',
                  pxPerMinute === level.pxPerMinute
                    ? 'bg-gold-500/15 text-gold-300'
                    : 'text-ink-400 hover:text-ink-100',
                )}
              >
                {level.label}
              </button>
            ))}
          </div>
        }
      />

      {/* Day picker */}
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {DAY_OFFSETS.map((offset) => (
          <button
            key={offset}
            type="button"
            onClick={() => setDayOffset(offset)}
            aria-pressed={dayOffset === offset}
            className={cx(
              'shrink-0 rounded-lg border px-3.5 py-2 text-sm transition-colors',
              dayOffset === offset
                ? 'border-gold-500 bg-gold-500/15 text-gold-300'
                : 'border-ink-700 bg-ink-900 text-ink-300 hover:border-ink-600 hover:text-ink-100',
            )}
          >
            {dayLabel(offset, now)}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[14rem] flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filtrer les chaînes…"
            aria-label="Filtrer les chaînes"
            className="h-10 w-full rounded-lg border border-ink-700 bg-ink-900 pl-9 pr-3 text-sm text-ink-50 placeholder:text-ink-400 focus:border-gold-500 focus:outline-none"
          />
        </div>

        <select
          value={activeCategory}
          onChange={(event) => setActiveCategory(event.target.value)}
          aria-label="Catégorie"
          className="h-10 min-w-[12rem] rounded-lg border border-ink-700 bg-ink-900 px-3 text-sm text-ink-100 focus:border-gold-500 focus:outline-none"
        >
          <option value="all">Toutes les catégories</option>
          {visibleCategories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      {channels.error ? <ErrorMessage message={channels.error} onRetry={channels.reload} /> : null}

      {channels.loading ? (
        <div className="flex h-64 items-center justify-center rounded-card border border-ink-800 bg-ink-900">
          <Spinner className="size-8 text-gold-500" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Aucune chaîne"
          description={
            query
              ? `Rien ne correspond à « ${query} ».`
              : 'Ce portail ne renvoie aucune chaîne en direct pour votre abonnement.'
          }
        />
      ) : (
        <EpgGrid
          channels={filtered}
          window={timeWindow}
          pxPerMinute={pxPerMinute}
          now={now}
          onSelect={setSelection}
          selectedEntryId={selection?.entry.id ?? null}
        />
      )}

      {selection ? (
        <>
          {/* Reserves the height the docked panel overlays. */}
          <div aria-hidden="true" className="h-32 lg:h-24" />
          <ProgrammeDetails
            selection={selection}
            now={now}
            onClose={() => setSelection(null)}
          />
        </>
      ) : null}
    </div>
  )
}

/**
 * Details for the selected programme, docked to the bottom of the viewport.
 *
 * Placed in the flow under the grid it would open below the fold — the grid is
 * tall, and clicking a programme would appear to do nothing. Fixed, it is
 * always visible, and it does not push the grid around when it opens.
 */
function ProgrammeDetails({
  selection,
  now,
  onClose,
}: {
  selection: EpgSelection
  now: number
  onClose: () => void
}) {
  const { channel, entry } = selection
  const replay = replayStatus({ entry, channel, now })

  const catchupHref = `/rattrapage?${new URLSearchParams({
    channel: channel.id,
    name: channel.name,
    title: entry.title,
    start: String(entry.start),
    dur: String(programmeMinutes(entry)),
  }).toString()}`

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <section
      aria-label="Détail du programme"
      className={cx(
        'fixed inset-x-0 bottom-0 z-40 border-t border-gold-500/30 bg-ink-900/95 p-4 backdrop-blur-md',
        // Clears the mobile tab bar and the home indicator; on large screens it
        // starts after the navigation rail instead.
        'pb-[calc(env(safe-area-inset-bottom)+4.75rem)] lg:pb-4 lg:pl-[calc(15rem+1.5rem)] lg:pr-6',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="gold">{channel.name}</Badge>
            <span className="text-xs text-ink-400">
              {formatTime(entry.start)} – {formatTime(entry.stop)}
            </span>
          </div>
          <h2 className="mt-2 text-lg font-semibold text-ink-50">{entry.title || 'Sans titre'}</h2>
          {entry.description ? (
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-300">
              {entry.description}
            </p>
          ) : (
            <p className="mt-2 text-sm text-ink-500">Aucun résumé fourni par le portail.</p>
          )}

          {!replay.replayable && replay.reason !== 'not-finished' ? (
            <p className="mt-2 text-xs text-ink-500">
              {replay.reason === 'expired'
                ? 'Ce programme est sorti de la fenêtre de rattrapage du portail.'
                : 'Cette chaîne ne propose pas de rattrapage.'}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {replay.replayable ? (
            <Link
              href={catchupHref}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-gold-500 px-3 text-sm font-semibold text-ink-950 transition-colors hover:bg-gold-400"
            >
              <ReplayIcon className="size-4" />
              Revoir
            </Link>
          ) : null}

          <Link
            href={`/direct?channel=${encodeURIComponent(channel.id)}`}
            className={cx(
              'inline-flex h-9 items-center justify-center rounded-lg px-3 text-sm transition-colors',
              replay.replayable
                ? 'border border-ink-700 bg-ink-850 text-ink-100 hover:bg-ink-800'
                : 'bg-gold-500 font-semibold text-ink-950 hover:bg-gold-400',
            )}
          >
            Regarder la chaîne
          </Link>

          <Button variant="ghost" size="sm" onClick={onClose}>
            Fermer
          </Button>
        </div>
      </div>
    </section>
  )
}

function dayLabel(offset: number, now: number): string {
  if (offset === 0) return "Aujourd'hui"
  if (offset === 1) return 'Demain'
  if (offset === -1) return 'Hier'

  const date = new Date(now)
  date.setDate(date.getDate() + offset)
  return date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
}
