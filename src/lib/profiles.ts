'use client'

/**
 * Portal profiles, stored in the browser.
 *
 * MBA Player has no backend account system: the portal credentials belong to
 * the person using the app and never leave their device except to reach their
 * own portal through the proxy routes. That means localStorage, and it means
 * anyone with access to the browser profile can read them — the README says so
 * plainly, and profiles can be removed from the account screen.
 */

import { EMPTY_ARRAY, notifyLocalChange, useLocalValue } from './local-store'

const PROFILES_KEY = 'mbaplayer.profiles.v1'
const ACTIVE_KEY = 'mbaplayer.activeProfile.v1'

interface BaseProfile {
  id: string
  name: string
  createdAt: number
  lastUsedAt: number
}

export interface XtreamProfile extends BaseProfile {
  source: 'xtream'
  host: string
  username: string
  password: string
}

export interface PlaylistProfile extends BaseProfile {
  source: 'm3u'
  playlistUrl: string
  /** XMLTV address supplied by the viewer, when the playlist declares none. */
  epgUrl?: string | null
}

export type Profile = XtreamProfile | PlaylistProfile

/**
 * A profile as supplied on sign-in, before storage assigns the identity fields.
 *
 * Written as a union of each variant rather than `Omit<Profile, …>`, because
 * `Omit` collapses a union into one object with the shared keys only — which
 * would let an Xtream profile be saved with a playlist URL.
 */
export type ProfileInput =
  | (Omit<XtreamProfile, 'id' | 'createdAt' | 'lastUsedAt'> & { id?: string })
  | (Omit<PlaylistProfile, 'id' | 'createdAt' | 'lastUsedAt'> & { id?: string })

/** What identifies the subscription in a profile list. */
export function profileSubtitle(profile: Profile): string {
  if (profile.source === 'xtream') {
    return `${profile.username} · ${profile.host.replace(/^https?:\/\//, '')}`
  }
  try {
    return `Playlist · ${new URL(profile.playlistUrl).host}`
  } catch {
    return 'Playlist'
  }
}

/**
 * Adds the source discriminator to a profile stored before playlist mode
 * existed. Those were all Xtream, and dropping them on upgrade would silently
 * sign the user out.
 */
function migrate(raw: Profile & { source?: string }): Profile | null {
  if (raw.source === 'm3u') return raw.playlistUrl ? (raw as PlaylistProfile) : null
  const legacy = raw as XtreamProfile
  if (!legacy.host) return null
  return { ...legacy, source: 'xtream' }
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Private browsing or a full quota: the app still works for this session.
  }
  notifyLocalChange()
}

export function listProfiles(): Profile[] {
  const profiles = readJson<(Profile & { source?: string })[]>(PROFILES_KEY, [])
  if (!Array.isArray(profiles)) return []
  return profiles
    .filter((p) => Boolean(p && typeof p === 'object' && p.id))
    .map(migrate)
    .filter((p): p is Profile => p !== null)
    .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
}

export function getProfile(id: string): Profile | null {
  return listProfiles().find((p) => p.id === id) ?? null
}

export function saveProfile(input: ProfileInput): Profile {
  const profiles = listProfiles()
  const now = Date.now()

  // Re-logging into the same subscription updates that profile instead of
  // stacking duplicates.
  const existing = input.id
    ? profiles.find((p) => p.id === input.id)
    : profiles.find((p) => sameSubscription(p, input))

  const profile: Profile = existing
    ? ({ ...existing, ...input, id: existing.id, lastUsedAt: now } as Profile)
    : ({
        ...input,
        id: crypto.randomUUID(),
        createdAt: now,
        lastUsedAt: now,
      } as Profile)

  const next = [profile, ...profiles.filter((p) => p.id !== profile.id)]
  writeJson(PROFILES_KEY, next)
  return profile
}

/** Two profiles are the same subscription when they point at the same access. */
function sameSubscription(a: Profile, b: ProfileInput): boolean {
  if (a.source !== b.source) return false
  if (a.source === 'xtream' && b.source === 'xtream') {
    return a.host === b.host && a.username === b.username
  }
  if (a.source === 'm3u' && b.source === 'm3u') return a.playlistUrl === b.playlistUrl
  return false
}

export function touchProfile(id: string): void {
  const profiles = listProfiles().map((p) => (p.id === id ? { ...p, lastUsedAt: Date.now() } : p))
  writeJson(PROFILES_KEY, profiles)
}

export function deleteProfile(id: string): void {
  writeJson(PROFILES_KEY, listProfiles().filter((p) => p.id !== id))
  if (getActiveProfileId() === id) clearActiveProfileId()
}

export function getActiveProfileId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(ACTIVE_KEY)
  } catch {
    return null
  }
}

export function setActiveProfileId(id: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(ACTIVE_KEY, id)
  } catch {
    // Ignored: the session still holds the profile in memory.
  }
  notifyLocalChange()
}

export function clearActiveProfileId(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(ACTIVE_KEY)
  } catch {
    // Ignored.
  }
  notifyLocalChange()
}

/* ------------------------------- React bindings ------------------------------- */

export function useProfiles(): Profile[] {
  return useLocalValue('profiles', listProfiles, EMPTY_ARRAY)
}

/**
 * The active profile, or null when there is none.
 *
 * `undefined` is never returned: the server snapshot is `null`, so a guarded
 * screen must also check `useProfilesReady()` before deciding to redirect.
 */
export function useActiveProfile(): Profile | null {
  return useLocalValue(
    'activeProfile',
    () => {
      const id = getActiveProfileId()
      return id ? getProfile(id) : null
    },
    null,
  )
}
