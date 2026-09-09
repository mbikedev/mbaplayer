'use client'

import Link from 'next/link'
import type { ButtonHTMLAttributes, ComponentProps, InputHTMLAttributes, ReactNode } from 'react'
import { AlertIcon } from './icons'

export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}

/* ------------------------------------ Button ----------------------------------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-gold-500 text-ink-950 hover:bg-gold-400 font-semibold',
  secondary: 'bg-ink-800 text-ink-100 hover:bg-ink-700 border border-ink-700',
  ghost: 'text-ink-300 hover:text-ink-50 hover:bg-ink-800',
  danger: 'bg-danger-500/15 text-danger-500 hover:bg-danger-500/25 border border-danger-500/40',
}

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-11 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2.5',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center rounded-lg transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Spinner className="size-4" /> : null}
      {children}
    </button>
  )
}

/**
 * Anchor styled as a button.
 *
 * Navigation must stay a real link — nesting an <a> inside a <button> is
 * invalid and breaks middle-click, "open in new tab", and screen readers.
 */
export function LinkButton({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...props
}: ComponentProps<typeof Link> & {
  variant?: ButtonVariant
  size?: ButtonSize
}) {
  return (
    <Link
      className={cx(
        'inline-flex items-center justify-center rounded-lg transition-colors',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...props}
    >
      {children}
    </Link>
  )
}

/* ------------------------------------ Input ------------------------------------ */

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  hint?: ReactNode
  error?: string | null
}

export function Field({ label, hint, error, className, id, ...props }: FieldProps) {
  const inputId = id ?? `field-${label.replace(/\s+/g, '-').toLowerCase()}`
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-ink-300">
        {label}
      </label>
      <input
        id={inputId}
        className={cx(
          'h-11 rounded-lg border bg-ink-900 px-3.5 text-sm text-ink-50 placeholder:text-ink-400',
          'transition-colors focus:border-gold-500 focus:outline-none',
          error ? 'border-danger-500' : 'border-ink-700',
          className,
        )}
        aria-invalid={error ? true : undefined}
        {...props}
      />
      {error ? (
        <p className="text-xs text-danger-500">{error}</p>
      ) : hint ? (
        <p className="text-xs text-ink-400">{hint}</p>
      ) : null}
    </div>
  )
}

/* ----------------------------------- Feedback ---------------------------------- */

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Chargement"
      className={cx(
        'inline-block animate-spin rounded-full border-2 border-current border-t-transparent',
        className ?? 'size-5',
      )}
    />
  )
}

export function ErrorMessage({
  message,
  onRetry,
}: {
  message: string
  onRetry?: () => void
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-card border border-danger-500/30 bg-danger-500/10 p-4 text-sm text-ink-100 sm:flex-row sm:items-center"
    >
      <AlertIcon className="size-5 shrink-0 text-danger-500" />
      <p className="flex-1">{message}</p>
      {onRetry ? (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          Réessayer
        </Button>
      ) : null}
    </div>
  )
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-ink-700 px-6 py-16 text-center">
      <p className="text-base font-medium text-ink-100">{title}</p>
      {description ? <p className="max-w-md text-sm text-ink-400">{description}</p> : null}
      {action}
    </div>
  )
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-50">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-ink-400">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  )
}

/** Poster-shaped placeholders shown while a catalogue page loads. */
export function GridSkeleton({ count = 18, aspect = 'aspect-[2/3]' }: { count?: number; aspect?: string }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className={cx('skeleton rounded-card', aspect)} />
      ))}
    </div>
  )
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'gold' | 'success' | 'danger' }) {
  const tones = {
    neutral: 'bg-ink-800 text-ink-300 border-ink-700',
    gold: 'bg-gold-500/15 text-gold-400 border-gold-500/30',
    success: 'bg-success-500/15 text-success-500 border-success-500/30',
    danger: 'bg-danger-500/15 text-danger-500 border-danger-500/30',
  }
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        tones[tone],
      )}
    >
      {children}
    </span>
  )
}
