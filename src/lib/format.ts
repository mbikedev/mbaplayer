/** Small formatting helpers shared across the UI. Locale is fixed to fr-FR. */

const LOCALE = 'fr-FR'

export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

export function formatDate(ms: number | null): string {
  if (!ms) return '—'
  return new Date(ms).toLocaleDateString(LOCALE, {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

export function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })
}

/** "dans 12 jours" / "expiré depuis 3 jours" / "illimité". */
export function formatExpiry(expiresAt: number | null): string {
  if (!expiresAt) return 'Illimité'
  const days = Math.round((expiresAt - Date.now()) / 86_400_000)
  if (days === 0) return "Expire aujourd'hui"
  if (days > 0) return `Expire dans ${days} jour${days > 1 ? 's' : ''}`
  return `Expiré depuis ${-days} jour${-days > 1 ? 's' : ''}`
}

export function formatRating(rating: number | null): string | null {
  if (rating === null || rating <= 0) return null
  // Portals mix /5 and /10 scales; anything above 5 is treated as /10.
  const outOfTen = rating > 5 ? rating : rating * 2
  return `${outOfTen.toFixed(1)}/10`
}

export function progressPercent(position: number, duration: number): number {
  if (!duration || duration <= 0) return 0
  return Math.min(100, Math.max(0, (position / duration) * 100))
}

/** Accent- and case-insensitive haystack for the search boxes. */
export function searchable(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}
