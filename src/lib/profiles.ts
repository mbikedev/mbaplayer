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

export interface Profile {
  id: string
  name: string
  host: string
  username: string
  password: string
  createdAt: number
  lastUsedAt: number
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
  const profiles = readJson<Profile[]>(PROFILES_KEY, [])
  if (!Array.isArray(profiles)) return []
  return profiles
    .filter((p): p is Profile => Boolean(p && typeof p === 'object' && p.id && p.host))
    .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
}

export function getProfile(id: string): Profile | null {
  return listProfiles().find((p) => p.id === id) ?? null
}

export function saveProfile(input: Omit<Profile, 'id' | 'createdAt' | 'lastUsedAt'> & { id?: string }): Profile {
  const profiles = listProfiles()
  const now = Date.now()

  // Re-logging into the same portal with the same user updates that profile
  // instead of stacking duplicates.
  const existing = input.id
    ? profiles.find((p) => p.id === input.id)
    : profiles.find((p) => p.host === input.host && p.username === input.username)

  const profile: Profile = existing
    ? { ...existing, ...input, id: existing.id, lastUsedAt: now }
    : {
        ...input,
        id: crypto.randomUUID(),
        createdAt: now,
        lastUsedAt: now,
      }

  const next = [profile, ...profiles.filter((p) => p.id !== profile.id)]
  writeJson(PROFILES_KEY, next)
  return profile
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
