'use client'

import { useCallback, useRef, useState } from 'react'
import { Spinner } from './ui'

/**
 * Renders a long list in slices, extending the window as the sentinel scrolls
 * into view.
 *
 * Portals commonly return tens of thousands of entries and mounting them all
 * locks the main thread for seconds. The window intentionally has no reset
 * logic: callers give the component a `key` built from the active filters, so
 * changing a filter remounts it and the window starts over.
 */
export function useInfiniteWindow<T>(items: T[], pageSize: number) {
  const [visible, setVisible] = useState(pageSize)
  const observerRef = useRef<IntersectionObserver | null>(null)

  // A callback ref rather than useEffect: the observer is attached the moment
  // the sentinel exists and detached when it goes away, including when the
  // list shrinks below one page and the sentinel is not rendered at all.
  const sentinelRef = useCallback(
    (node: Element | null) => {
      observerRef.current?.disconnect()
      if (!node) return

      const observer = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting) setVisible((count) => count + pageSize)
        },
        { rootMargin: '600px' },
      )
      observer.observe(node)
      observerRef.current = observer
    },
    [pageSize],
  )

  return {
    shown: items.slice(0, visible),
    hasMore: visible < items.length,
    sentinelRef,
  }
}

/** Sentinel row shown while more items remain. */
export function LoadMoreSentinel({
  ref,
  as: Tag = 'div',
}: {
  ref: (node: Element | null) => void
  as?: 'div' | 'li'
}) {
  return (
    <Tag ref={ref as never} className="flex justify-center py-6">
      <Spinner className="size-6 text-ink-400" />
    </Tag>
  )
}
