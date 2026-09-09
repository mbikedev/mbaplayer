'use client'

import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useIsHydrated } from '@/lib/local-store'
import {
  clearActiveProfileId,
  getProfile,
  saveProfile,
  setActiveProfileId,
  touchProfile,
  useActiveProfile,
  type Profile,
  type ProfileInput,
} from '@/lib/profiles'
import { saveSettings, useSettings, type Settings } from '@/lib/storage'
import { clearCatalogCache } from '@/lib/catalog'
import type { Credentials } from '@/lib/credentials'

interface SessionValue {
  /** The active portal profile, or null when nobody is signed in. */
  profile: Profile | null
  credentials: Credentials | null
  /** False until the client has hydrated and localStorage has been read. */
  ready: boolean
  settings: Settings
  updateSettings: (patch: Partial<Settings>) => void
  signIn: (profile: ProfileInput) => Profile
  switchProfile: (id: string) => Profile | null
  signOut: () => void
}

const SessionContext = createContext<SessionValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter()

  // Both of these read localStorage through the external store, so there is no
  // effect to synchronise and no render with a stale value.
  const profile = useActiveProfile()
  const settings = useSettings()
  const ready = useIsHydrated()

  const signIn = useCallback<SessionValue['signIn']>((input) => {
    const saved = saveProfile(input)
    setActiveProfileId(saved.id)
    clearCatalogCache()
    return saved
  }, [])

  const switchProfile = useCallback<SessionValue['switchProfile']>((id) => {
    const found = getProfile(id)
    if (!found) return null
    touchProfile(id)
    setActiveProfileId(id)
    clearCatalogCache()
    return found
  }, [])

  const signOut = useCallback(() => {
    clearActiveProfileId()
    clearCatalogCache()
    router.push('/')
  }, [router])

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    saveSettings(patch)
  }, [])

  const credentials = useMemo<Credentials | null>(() => {
    if (!profile) return null
    return profile.source === 'm3u'
      ? { source: 'm3u', playlistUrl: profile.playlistUrl }
      : {
          source: 'xtream',
          host: profile.host,
          username: profile.username,
          password: profile.password,
        }
  }, [profile])

  const value = useMemo<SessionValue>(
    () => ({
      profile,
      credentials,
      ready,
      settings,
      updateSettings,
      signIn,
      switchProfile,
      signOut,
    }),
    [profile, credentials, ready, settings, updateSettings, signIn, switchProfile, signOut],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionValue {
  const context = useContext(SessionContext)
  if (!context) throw new Error('useSession doit être utilisé dans un SessionProvider.')
  return context
}
