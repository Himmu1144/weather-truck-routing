import { useEffect, useState } from 'react'

/** The current time, refreshed every `everyMs`: for counters and countdowns. */
export function useNow(everyMs = 250): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), everyMs)
    return () => window.clearInterval(timer)
  }, [everyMs])
  return now
}
