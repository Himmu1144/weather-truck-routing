import { useEffect, useMemo, useState } from 'react'
import type { Plan } from '../api/types'
import { corridorGrid, type Grid } from './grid'
import { fetchHeatWeather, HeatUnavailable, type HeatWeather } from './weather'

export type HeatState =
  | { status: 'off' }
  | { status: 'loading' }
  | { status: 'ready'; grid: Grid; weather: HeatWeather }
  | { status: 'failed'; error: HeatUnavailable }

type Result = { plan: Plan; key: string; attempt: number } & ({ grid: Grid; weather: HeatWeather } | { error: HeatUnavailable })

// The heatmap depends only on the routes and the departure, not on rest breaks or the load:
// the same trip planned again (or with rest breaks flipped) reuses its weather for 30 minutes.
const CACHE_MS = 30 * 60 * 1000
const fetched = new Map<string, { grid: Grid; weather: HeatWeather; expires: number }>()
export const heatKey = (plan: Plan) =>
  [plan.trip.departure, ...plan.routes.map(r => `${r.id}:${r.distance_mi}:${r.line.map(([lon, lat]) => `${lon.toFixed(4)},${lat.toFixed(4)}`).join(';')}`)].join('|')

function cached(key: string) {
  const entry = fetched.get(key)
  if (entry && entry.expires > Date.now()) return entry
  fetched.delete(key)
}

/** The heatmap's weather for a plan, fetched once per plan (and again on retry). */
export function useHeatWeather(plan: Plan | null): { heat: HeatState; retry: () => void } {
  const [result, setResult] = useState<Result | null>(null)
  const [attempt, setAttempt] = useState(0)

  // Check expiry for a new plan, never for slider rerenders of the active trip.
  const { key, known } = useMemo(() => {
    const key = plan ? heatKey(plan) : ''
    return { key, known: cached(key) }
  }, [plan])
  useEffect(() => {
    if (!plan || known) return
    const controller = new AbortController()
    const grid = corridorGrid(plan)
    fetchHeatWeather(grid.cells, plan.trip.departure, controller.signal).then(
      weather => { fetched.set(key, { grid, weather, expires: Date.now() + CACHE_MS }); setResult({ plan, key, attempt, grid, weather }) },
      (error: unknown) => {
        if (controller.signal.aborted) return
        setResult({ plan, key, attempt, error: error instanceof HeatUnavailable ? error : new HeatUnavailable('The weather layer could not load.') })
      },
    )
    return () => controller.abort()
  }, [plan, key, attempt, known])

  const retry = () => setAttempt(a => a + 1)
  if (!plan) return { heat: { status: 'off' }, retry }
  if (known) return { heat: { status: 'ready', grid: known.grid, weather: known.weather }, retry }
  if (!result || result.plan !== plan || result.key !== key || result.attempt !== attempt) return { heat: { status: 'loading' }, retry }
  return { heat: 'error' in result ? { status: 'failed', error: result.error } : { status: 'ready', grid: result.grid, weather: result.weather }, retry }
}
