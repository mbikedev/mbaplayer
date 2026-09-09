'use client'

/** Per-device viewing state: favourites, resume positions, and preferences. */

import { EMPTY_ARRAY, notifyLocalChange, useLocalValue } from './local-store'

const FAVORITES_KEY = 'mbaplayer.favorites.v1'
const RESUME_KEY = 'mbaplayer.resume.v1'
const SETTINGS_KEY = 'mbaplayer.settings.v1'

export type ContentKind = 'live' | 'movie' | 'series'

export interface FavoriteItem {
  key: string
  kind: ContentKind
  id: string
  name: string
  poster: string | null
  addedAt: number
}

export interface ResumeItem {
  key: string
  kind: Exclude<ContentKind, 'live'>
  id: string
  /** Episode id for series, equal to `id` for movies. */
  streamId: string
  name: string
  subtitle: string | null
  poster: string | null
  extension: string
  position: number
  duration: number
  updatedAt: number
}

export interface Settings {
  /** Container requested for live channels. `m3u8` works in browsers; `ts` does not. */
  liveFormat: 'm3u8' | 'ts'
  /** Hide adult-flagged categories from every catalogue. */
  hideAdult: boolean
  /** Autoplay the next episode when one finishes. */
  autoplayNext: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  liveFormat: 'm3u8',
  hideAdult: false,
  autoplayNext: true,
}

const RESUME_LIMIT = 60

function read<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Quota or private mode; viewing state is a convenience, not a requirement.
  }
  // Every component reading this key re-renders with the new value.
  notifyLocalChange()
}

export function itemKey(kind: ContentKind, id: string): string {
  return `${kind}:${id}`
}

/* ---------------------------------- Favourites ---------------------------------- */

export function listFavorites(): FavoriteItem[] {
  const items = read<FavoriteItem[]>(FAVORITES_KEY, [])
  return Array.isArray(items) ? items.sort((a, b) => b.addedAt - a.addedAt) : []
}

export function isFavorite(kind: ContentKind, id: string): boolean {
  const key = itemKey(kind, id)
  return listFavorites().some((f) => f.key === key)
}

export function toggleFavorite(item: Omit<FavoriteItem, 'key' | 'addedAt'>): boolean {
  const key = itemKey(item.kind, item.id)
  const favorites = listFavorites()
  const existing = favorites.some((f) => f.key === key)
  const next = existing
    ? favorites.filter((f) => f.key !== key)
    : [{ ...item, key, addedAt: Date.now() }, ...favorites]
  write(FAVORITES_KEY, next)
  return !existing
}

/* ------------------------------- Continue watching ------------------------------ */

export function listResume(): ResumeItem[] {
  const items = read<ResumeItem[]>(RESUME_KEY, [])
  if (!Array.isArray(items)) return []
  return items.sort((a, b) => b.updatedAt - a.updatedAt)
}

export function getResume(kind: 'movie' | 'series', streamId: string): ResumeItem | null {
  return listResume().find((r) => r.kind === kind && r.streamId === streamId) ?? null
}

/**
 * Records a resume point. Positions in the first 30 seconds or the last 5% of
 * the runtime are dropped: those mean "barely started" and "finished", neither
 * of which is worth offering to resume.
 */
export function saveResume(item: Omit<ResumeItem, 'key' | 'updatedAt'>): void {
  const key = itemKey(item.kind, item.streamId)
  const others = listResume().filter((r) => r.key !== key)

  const finished = item.duration > 0 && item.position >= item.duration * 0.95
  if (item.position < 30 || finished) {
    write(RESUME_KEY, others.slice(0, RESUME_LIMIT))
    return
  }

  write(RESUME_KEY, [{ ...item, key, updatedAt: Date.now() }, ...others].slice(0, RESUME_LIMIT))
}

export function clearResume(kind: 'movie' | 'series', streamId: string): void {
  const key = itemKey(kind, streamId)
  write(RESUME_KEY, listResume().filter((r) => r.key !== key))
}

/* ---------------------------------- Settings ---------------------------------- */

export function getSettings(): Settings {
  return { ...DEFAULT_SETTINGS, ...read<Partial<Settings>>(SETTINGS_KEY, {}) }
}

export function saveSettings(settings: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...settings }
  write(SETTINGS_KEY, next)
  return next
}

const ADULT_PATTERN = /\b(adult|xxx|porn|18\+|for\s?adults)\b/i

export function isAdultCategoryName(name: string): boolean {
  return ADULT_PATTERN.test(name)
}

/* ------------------------------- React bindings ------------------------------- */

export function useFavorites(): FavoriteItem[] {
  return useLocalValue('favorites', listFavorites, EMPTY_ARRAY)
}

export function useIsFavorite(kind: ContentKind, id: string): boolean {
  const favorites = useFavorites()
  const key = itemKey(kind, id)
  return favorites.some((favorite) => favorite.key === key)
}

export function useResumeList(): ResumeItem[] {
  return useLocalValue('resume', listResume, EMPTY_ARRAY)
}

export function useResumeFor(kind: 'movie' | 'series', streamId: string): ResumeItem | null {
  const resume = useResumeList()
  return resume.find((item) => item.kind === kind && item.streamId === streamId) ?? null
}

export function useSettings(): Settings {
  return useLocalValue('settings', getSettings, DEFAULT_SETTINGS)
}
