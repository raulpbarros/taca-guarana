import { useEffect, useRef, useState } from 'react'

// How long to coalesce rapid mutations before persisting. Short enough that a
// reload right after a tap is effectively always saved, long enough that a burst
// of keystrokes / cup taps becomes a single write.
const WRITE_DELAY = 250

/**
 * Persisted state hook. Mirrors useState but syncs to localStorage.
 *
 * Writes are debounced: instead of a synchronous JSON.stringify of the whole
 * state on every keystroke / cup tap (the main-thread cost that made the app
 * feel heavy), changes are coalesced into one write after WRITE_DELAY. The
 * pending write is flushed synchronously on tab hide / reload / close / unmount,
 * so the reload-resilience guarantee (CLAUDE.md §1) still holds — only an abrupt
 * power-off inside the ~250ms window can drop the very last change.
 *
 * Hydrates from storage on first mount; falls back to `initialValue` if absent/corrupt.
 *
 * @param {string} key - localStorage key (use the tacaGuarana:v1 namespace).
 * @param {*} initialValue - default state when nothing is stored.
 */
export function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw != null ? JSON.parse(raw) : initialValue
    } catch {
      return initialValue
    }
  })

  // Latest key/value, read by out-of-render flushes (unload, visibility, unmount).
  const latest = useRef({ key, value })
  latest.current = { key, value }
  const hydrated = useRef(false)
  const timer = useRef(0)

  const flush = () => {
    clearTimeout(timer.current)
    timer.current = 0
    try {
      localStorage.setItem(latest.current.key, JSON.stringify(latest.current.value))
    } catch {
      // Storage full or unavailable — keep running in-memory.
    }
  }

  // Skip the write on the first render (before hydration settles), then debounce
  // every subsequent change. Each value change clears the prior timer (cleanup)
  // and schedules a fresh one, so a burst collapses to one write.
  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true
      return
    }
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, WRITE_DELAY)
    return () => clearTimeout(timer.current)
  }, [key, value])

  // Never lose the last change: persist synchronously when the tab is hidden,
  // reloaded, closed, or this hook unmounts. flush() reads from `latest`, so a
  // cleared debounce timer doesn't matter here.
  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && flush()
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onHide)
      flush()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return [value, setValue]
}
