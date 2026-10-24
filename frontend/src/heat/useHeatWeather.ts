import { useEffect, useState } from 'react'
import type { Plan } from '../api/types'
import { corridorGrid, type Grid } from './grid'
import { fetchHeatWeather, HeatUnavailable, type HeatWeather } from './weather'

export type HeatState =
  | { status: 'off' }
  | { status: 'loading' }
  | { status: 'ready'; grid: Grid; weather: HeatWeather }
  | { status: 'failed'; error: HeatUnavailable }

type Result = { key: string; attempt: number } & ({ grid: Grid; weather: HeatWeather } | { error: HeatUnavailable })

// The heatmap depends only on the routes and the departure, not on rest breaks or the load:
// the same trip planned again (or with rest breaks flipped) reuses its weather and fetches nothing.
const fetched = new Map<string, { grid: Grid; weather: HeatWeather }>()
export const heatKey = (plan: Plan) =>
  [plan.trip.departure, ...plan.routes.map(r => `${r.id}:${r.distance_mi}:${r.line.length}`)].join('|')

/** The heatmap's weather for a plan, fetched once per plan (and again on retry). */
export function useHeatWeather(plan: Plan | null): { heat: HeatState; retry: () => void } {
  const [result, setResult] = useState<Result | null>(null)
  const [attempt, setAttempt] = useState(0)

  const key = plan ? heatKey(plan) : ''
  useEffect(() => {
    if (!plan || fetched.has(key)) return
    const controller = new AbortController()
    const grid = corridorGrid(plan)
    fetchHeatWeather(grid.cells, plan.trip.departure, controller.signal).then(
      weather => { fetched.set(key, { grid, weather }); setResult({ key, attempt, grid, weather }) },
      (error: unknown) => {
        if (controller.signal.aborted) return
        setResult({ key, attempt, error: error instanceof HeatUnavailable ? error : new HeatUnavailable('The weather layer could not load.') })
      },
    )
    return () => controller.abort()
  }, [plan, key, attempt])

  const retry = () => setAttempt(a => a + 1)
  if (!plan) return { heat: { status: 'off' }, retry }
  const known = fetched.get(key)
  if (known) return { heat: { status: 'ready', ...known }, retry }
  if (!result || result.key !== key || result.attempt !== attempt) return { heat: { status: 'loading' }, retry }
  return { heat: 'error' in result ? { status: 'failed', error: result.error } : { status: 'ready', grid: result.grid, weather: result.weather }, retry }
}
