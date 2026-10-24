import { useSyncExternalStore } from 'react'

const subscribe = (changed: () => void) => {
  window.addEventListener('resize', changed)
  return () => window.removeEventListener('resize', changed)
}

/** The window's height in px, kept up to date (a phone's toolbar showing or hiding changes it). */
export function useViewportHeight(): number {
  return useSyncExternalStore(subscribe, () => window.innerHeight)
}
