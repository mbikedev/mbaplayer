'use client'

import { useEffect } from 'react'

/**
 * Registers the app shell service worker.
 *
 * The worker deliberately never caches `/api/*` — playlists, segments and
 * catalogue responses are per-session and often huge — so it only makes the
 * shell installable and available offline enough to show the login screen.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (!('serviceWorker' in navigator)) return

    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // Registration failing (unsupported browser, insecure origin) must not
        // break the app; it only costs offline support.
      })
    }

    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })

    return () => window.removeEventListener('load', register)
  }, [])

  return null
}
