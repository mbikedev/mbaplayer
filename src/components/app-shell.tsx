'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useSession } from '@/context/session'
import { Spinner, cx } from './ui'
import {
  FilmIcon,
  GuideIcon,
  HomeIcon,
  LiveIcon,
  LogoIcon,
  SearchIcon,
  SeriesIcon,
  SettingsIcon,
  StarIcon,
} from './icons'

interface NavItem {
  href: string
  label: string
  Icon: (props: React.SVGProps<SVGSVGElement>) => ReactNode
}

const NAV_ITEMS: NavItem[] = [
  { href: '/accueil', label: 'Accueil', Icon: HomeIcon },
  { href: '/direct', label: 'Direct', Icon: LiveIcon },
  { href: '/guide', label: 'Guide', Icon: GuideIcon },
  { href: '/films', label: 'Films', Icon: FilmIcon },
  { href: '/series', label: 'Séries', Icon: SeriesIcon },
  { href: '/favoris', label: 'Favoris', Icon: StarIcon },
]

// Search lives in the header on phones, which leaves the bottom bar for these.
const MOBILE_NAV_ITEMS = NAV_ITEMS

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, ready } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const [query, setQuery] = useState('')

  // The session is only known after the client has read localStorage, so the
  // guard waits for `ready` instead of bouncing on first paint.
  useEffect(() => {
    if (ready && !profile) router.replace('/')
  }, [ready, profile, router])

  if (!ready || !profile) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner className="size-8 text-gold-500" />
      </div>
    )
  }

  function submitSearch(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = query.trim()
    if (trimmed) router.push(`/recherche?q=${encodeURIComponent(trimmed)}`)
  }

  return (
    <div className="flex min-h-dvh">
      {/* Desktop rail */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-ink-800 bg-ink-900 px-4 py-6 lg:flex">
        <Link href="/accueil" className="mb-8 flex items-center gap-2.5 px-2">
          <LogoIcon className="size-8 text-gold-500" />
          <span className="text-lg font-semibold tracking-tight text-ink-50">MBA Player</span>
        </Link>

        <nav className="flex-1 space-y-1">
          {NAV_ITEMS.map(({ href, label, Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`)
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  active
                    ? 'bg-gold-500/12 text-gold-400'
                    : 'text-ink-300 hover:bg-ink-800 hover:text-ink-50',
                )}
              >
                <Icon className="size-5" />
                {label}
              </Link>
            )
          })}
        </nav>

        <Link
          href="/compte"
          className={cx(
            'flex items-center gap-3 rounded-lg border border-ink-700 px-3 py-2.5 text-sm transition-colors',
            pathname === '/compte'
              ? 'border-gold-500/40 bg-gold-500/10 text-gold-400'
              : 'text-ink-300 hover:bg-ink-800 hover:text-ink-50',
          )}
        >
          <SettingsIcon className="size-5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{profile.name}</span>
        </Link>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header: search everywhere, brand on small screens */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-ink-800 bg-ink-950/85 px-4 py-3 backdrop-blur-md sm:px-6">
          <Link href="/accueil" className="flex items-center gap-2 lg:hidden">
            <LogoIcon className="size-7 text-gold-500" />
            <span className="sr-only">MBA Player — accueil</span>
          </Link>

          <form onSubmit={submitSearch} className="relative flex-1" role="search">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher une chaîne, un film, une série…"
              aria-label="Rechercher"
              className="h-10 w-full rounded-lg border border-ink-700 bg-ink-900 pl-9 pr-3 text-sm text-ink-50 placeholder:text-ink-400 focus:border-gold-500 focus:outline-none"
            />
          </form>

          <Link
            href="/compte"
            aria-label="Compte et réglages"
            className="rounded-lg p-2 text-ink-300 transition-colors hover:bg-ink-800 hover:text-ink-50 lg:hidden"
          >
            <SettingsIcon className="size-5" />
          </Link>
        </header>

        <main className="flex-1 px-4 pb-24 pt-6 sm:px-6 lg:pb-10">{children}</main>
      </div>

      {/* Mobile tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-ink-800 bg-ink-900/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
        {MOBILE_NAV_ITEMS.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`)
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cx(
                'flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors',
                active ? 'text-gold-400' : 'text-ink-400',
              )}
            >
              <Icon className="size-5" />
              {label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
