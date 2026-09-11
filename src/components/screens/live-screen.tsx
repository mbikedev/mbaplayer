'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useSession } from '@/context/session'
import { useAsync } from '@/hooks/use-async'
import { useNow } from '@/hooks/use-now'
import { formatTime, searchable } from '@/lib/format'
import { isAdultCategoryName } from '@/lib/storage'
import { bannerLabel, firstPlayable, isDecorativeName, logoFallback } from '@/lib/channel-name'
import { decodableAlternative } from '@/lib/channel-variants'
import { getLiveCategories, getLiveChannels, getShortEpg, streamUrl } from '@/lib/catalog'
import type { LiveChannel } from '@/lib/xtream-types'
import { FavoriteButton } from '../favorite-button'
import { LoadMoreSentinel, useInfiniteWindow } from '../infinite-list'
import { VideoPlayer } from '../video-player'
import { Badge, Button, EmptyState, ErrorMessage, LinkButton, PageHeader, cx } from '../ui'
import { GuideIcon, RefreshIcon, SearchIcon } from '../icons'

/** Channel lists routinely exceed 10 000 entries, so the list renders in slices. */
const LIST_PAGE_SIZE = 80

export function LiveScreen({ initialChannelId }: { initialChannelId: string | null }) {
  const { credentials, settings } = useSession()
  const [activeCategory, setActiveCategory] = useState('all')
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<LiveChannel | null>(null)
  /** The channel the player last refused, so the offer only shows for that one. */
  const [unplayableId, setUnplayableId] = useState<string | null>(null)

  const categories = useAsync(() => getLiveCategories(credentials!), [credentials], {
    enabled: Boolean(credentials),
  })
  const channels = useAsync(() => getLiveChannels(credentials!), [credentials], {
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
    const all = channels.data ?? []
    const needle = searchable(query.trim())
    return all.filter((channel) => {
      if (hiddenCategoryIds.has(channel.categoryId)) return false
      if (activeCategory !== 'all' && channel.categoryId !== activeCategory) return false
      if (needle && !searchable(channel.name).includes(needle)) return false
      return true
    })
  }, [channels.data, query, activeCategory, hiddenCategoryIds])

  // Falling back to the deep-linked channel and then the first match keeps the
  // player from ever being empty, and is derived rather than set in an effect.
  // An explicit pick always wins, so arriving from the guide does not pin the
  // selection once the viewer starts browsing.
  // Banners are listed but are not channels, so they must not be counted as
  // ones: a subscription reads as 9 856 channels when a few hundred of those
  // entries are headings.
  const channelCount = useMemo(
    () => filtered.reduce((total, channel) => (isDecorativeName(channel.name) ? total : total + 1), 0),
    [filtered],
  )

  const linked = initialChannelId
    ? (filtered.find((channel) => channel.id === initialChannelId) ?? null)
    : null
  // Not `filtered[0]`: providers head their live list with group banners that
  // carry a stream id but no stream, so opening on the first entry meant
  // opening on one of those. An explicit pick still wins — a viewer who clicks
  // a banner gets the stall message rather than a silently ignored click.
  const selected = picked ?? linked ?? firstPlayable(filtered)

  // Offered when the player refuses the current entry: resellers publish the
  // same channel at several qualities and the top tiers are routinely H.265,
  // so the answer is usually one row away in the list the viewer already has.
  const alternative = useMemo(
    () => (selected ? decodableAlternative(selected, channels.data ?? []) : null),
    [selected, channels.data],
  )

  // Resolving a stream address is asynchronous: in playlist mode it comes from
  // the playlist itself, which may still be loading.
  const source = useAsync(
    () => streamUrl(credentials!, 'live', selected!.id, settings.liveFormat),
    [credentials, selected?.id, settings.liveFormat],
    { enabled: Boolean(credentials && selected) },
  )
  const src = source.data ?? null

  return (
    <div className="space-y-6">
      {/* Pinned under the app bar: the player is tall, so reaching the channel
          list means scrolling, and an unpinned header carried the channel count
          and the Guide/Refresh actions off screen with it. The negative margins
          let its background span the full width of the main column, so nothing
          shows through while it passes underneath. */}
      <div className="sticky top-16 z-20 -mx-4 bg-ink-950 px-4 pb-3 pt-2 sm:-mx-6 sm:px-6">
        <PageHeader
          title="TV en direct"
          subtitle={
            channels.data
              ? `${channelCount.toLocaleString('fr-FR')} chaîne${channelCount > 1 ? 's' : ''}`
              : undefined
          }
          actions={
            <>
              <LinkButton variant="secondary" size="sm" href="/guide">
                <GuideIcon className="size-4" />
                Guide TV
              </LinkButton>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  categories.reload()
                  channels.reload()
                }}
              >
                <RefreshIcon className="size-4" />
                Actualiser
              </Button>
            </>
          }
        />
      </div>

      {channels.error ? <ErrorMessage message={channels.error} onRetry={channels.reload} /> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          {selected ? (
            <>
              <VideoPlayer
                key={selected.id}
                src={src}
                onUnplayable={() => setUnplayableId(selected.id)}
                title={selected.name}
                subtitle={
                  visibleCategories.find((c) => c.id === selected.categoryId)?.name ?? null
                }
                poster={selected.icon}
                live
                isHls={settings.liveFormat === 'm3u8'}
              />

              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-lg font-semibold text-ink-50">{selected.name}</h2>
                  {selected.hasArchive ? (
                    <p className="mt-1 text-xs text-ink-400">
                      Rattrapage disponible
                      {selected.archiveDays > 0
                        ? ` sur ${selected.archiveDays} jour${selected.archiveDays > 1 ? 's' : ''}`
                        : ''}
                      {' — '}
                      <Link href="/guide" className="text-gold-400 hover:text-gold-300">
                        revoir un programme dans le guide
                      </Link>
                    </p>
                  ) : null}
                </div>
                <FavoriteButton
                  kind="live"
                  id={selected.id}
                  name={selected.name}
                  poster={selected.icon}
                  size="sm"
                />
              </div>

              {unplayableId === selected.id && alternative ? (
                <div className="rounded-card border border-gold-500/30 bg-gold-500/10 px-4 py-3 text-sm text-gold-300">
                  <p>
                    Cette chaîne est probablement encodée en H.265, que ce navigateur ne décode
                    pas. Le portail propose la même chaîne dans une version lisible.
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-3"
                    onClick={() => {
                      setUnplayableId(null)
                      setPicked(alternative)
                    }}
                  >
                    Basculer sur {alternative.name}
                  </Button>
                </div>
              ) : null}

              {settings.liveFormat === 'ts' ? (
                <p className="rounded-card border border-gold-500/30 bg-gold-500/10 px-4 py-3 text-sm text-gold-300">
                  Le format <strong>TS</strong> n’est pas lisible nativement par les navigateurs.
                  Repassez en HLS (m3u8) dans les réglages si l’image reste noire.
                </p>
              ) : null}

              <EpgPanel channelId={selected.id} />
            </>
          ) : channels.loading ? (
            <div className="skeleton aspect-video w-full rounded-card" />
          ) : (
            <EmptyState
              title="Aucune chaîne"
              description="Ce portail ne renvoie aucune chaîne en direct pour votre abonnement."
            />
          )}
        </div>

        {/* Channel picker */}
        <aside className="flex min-h-0 flex-col gap-3 xl:sticky xl:top-20 xl:max-h-[calc(100dvh-6rem)]">
          <div className="relative">
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
            className="h-10 rounded-lg border border-ink-700 bg-ink-900 px-3 text-sm text-ink-100 focus:border-gold-500 focus:outline-none"
          >
            <option value="all">Toutes les catégories</option>
            {visibleCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>

          {!channels.loading && filtered.length === 0 ? (
            <p className="rounded-card border border-ink-800 bg-ink-900 px-3 py-6 text-center text-sm text-ink-400">
              Aucune chaîne trouvée.
            </p>
          ) : (
            <ChannelList
              key={`${activeCategory}|${query}`}
              channels={filtered}
              selectedId={selected?.id ?? null}
              onSelect={setPicked}
            />
          )}
        </aside>
      </div>
    </div>
  )
}

/**
 * A channel's logo, or a readable stand-in.
 *
 * Hiding a broken <img> left an empty square, which is how most of a real
 * portal's list ends up looking: the URLs are there, the images are not.
 * Tracking the failure lets the fallback render in its place.
 */
function ChannelLogo({ channel }: { channel: LiveChannel }) {
  const [failed, setFailed] = useState(false)
  const showImage = Boolean(channel.icon) && !failed

  return (
    <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-ink-850 text-[10px] font-semibold text-ink-400">
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={channel.icon!}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="size-full object-contain"
        />
      ) : (
        logoFallback(channel.name, channel.num)
      )}
    </span>
  )
}

function ChannelList({
  channels,
  selectedId,
  onSelect,
}: {
  channels: LiveChannel[]
  selectedId: string | null
  onSelect: (channel: LiveChannel) => void
}) {
  const { shown, hasMore, sentinelRef } = useInfiniteWindow(channels, LIST_PAGE_SIZE)

  return (
    <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto rounded-card border border-ink-800 bg-ink-900 p-1.5">
      {shown.map((channel) =>
        // A banner is what the reseller meant as a group heading, so it is
        // rendered as one: readable, and not a button that leads nowhere.
        isDecorativeName(channel.name) ? (
          <li key={channel.id} className="px-2.5 pb-0.5 pt-4 first:pt-1">
            <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-ink-500">
              {bannerLabel(channel.name)}
            </p>
          </li>
        ) : (
          <li key={channel.id}>
            <button
              type="button"
              onClick={() => onSelect(channel)}
              aria-current={selectedId === channel.id ? 'true' : undefined}
              className={cx(
                'flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors',
                selectedId === channel.id
                  ? 'bg-gold-500/15 text-gold-300'
                  : 'text-ink-200 hover:bg-ink-800',
              )}
            >
              <ChannelLogo channel={channel} />
              <span className="min-w-0 flex-1 truncate text-sm">{channel.name}</span>
            </button>
          </li>
        ),
      )}

      {hasMore ? <LoadMoreSentinel ref={sentinelRef} as="li" /> : null}
    </ul>
  )
}

/** "Now and next" strip under the player, when the portal exposes an EPG. */
function EpgPanel({ channelId }: { channelId: string }) {
  const { credentials } = useSession()
  const now = useNow()
  const epg = useAsync(() => getShortEpg(credentials!, channelId, 6), [credentials, channelId], {
    enabled: Boolean(credentials),
  })

  if (epg.loading) {
    return <div className="skeleton h-28 w-full rounded-card" />
  }

  const entries = epg.data ?? []
  if (entries.length === 0) return null

  const current =
    entries.find((entry) => entry.start <= now && entry.stop >= now) ??
    entries.find((entry) => entry.nowPlaying) ??
    entries[0]

  return (
    <section className="space-y-3 rounded-card border border-ink-800 bg-ink-900 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Badge tone="gold">En ce moment</Badge>
          <h3 className="mt-2 truncate text-base font-medium text-ink-50">{current.title}</h3>
          <p className="text-xs text-ink-400">
            {formatTime(current.start)} – {formatTime(current.stop)}
          </p>
        </div>
      </div>

      {current.description ? (
        <p className="line-clamp-3 text-sm leading-relaxed text-ink-300">{current.description}</p>
      ) : null}

      <ul className="space-y-1.5 border-t border-ink-800 pt-3">
        {entries
          .filter((entry) => entry.start > now)
          .slice(0, 4)
          .map((entry) => (
            <li key={entry.id} className="flex gap-3 text-sm">
              <span className="w-12 shrink-0 tabular-nums text-ink-400">
                {formatTime(entry.start)}
              </span>
              <span className="min-w-0 flex-1 truncate text-ink-200">{entry.title}</span>
            </li>
          ))}
      </ul>
    </section>
  )
}
