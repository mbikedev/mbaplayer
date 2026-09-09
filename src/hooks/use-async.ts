'use client'

import { useCallback, useEffect, useState } from 'react'

export interface AsyncState<T> {
  data: T | null
  error: string | null
  loading: boolean
  reload: () => void
}

interface InternalState<T> {
  data: T | null
  error: string | null
  loading: boolean
}

/**
 * Runs an async loader whenever its dependencies change, with the two things
 * every screen here needs: a manual `reload`, and cancellation so a slow
 * category request cannot overwrite the results of a newer one.
 *
 * `enabled: false` holds the loader back until its inputs exist (typically the
 * session credentials, which are null before hydration). The loading flag is
 * derived from `enabled` rather than assigned inside the effect, so the effect
 * only ever sets state from a settled promise.
 */
export function useAsync<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  deps: React.DependencyList,
  options: { enabled?: boolean } = {},
): AsyncState<T> {
  const enabled = options.enabled ?? true
  const [state, setState] = useState<InternalState<T>>({
    data: null,
    error: null,
    loading: true,
  })
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!enabled) return

    const controller = new AbortController()

    loader(controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return
        setState({ data, error: null, loading: false })
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return
        setState({
          data: null,
          error: caught instanceof Error ? caught.message : 'Une erreur est survenue.',
          loading: false,
        })
      })

    return () => controller.abort()
    // `loader` is an inline closure at every call site; `deps` is what actually
    // decides when the request should be repeated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled, nonce])

  const reload = useCallback(() => {
    // Called from an event handler, so setting state here is safe and gives the
    // refresh button an immediate spinner.
    setState((current) => ({ ...current, loading: true }))
    setNonce((value) => value + 1)
  }, [])

  return {
    data: state.data,
    error: state.error,
    loading: enabled && state.loading,
    reload,
  }
}
