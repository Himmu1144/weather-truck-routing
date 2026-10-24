import { useEffect, useState } from 'react'
import type { Plan } from '../api/types'
import { corridorGrid, type Grid } from './grid'
import { fetchHeatWeather, HeatUnavailable, type HeatWeather } from './weather'

export type HeatState =
  | { status: 'off' }
  | { status: 'loading' }
  | { status: 'ready'; grid: Grid; weather: HeatWeather }
  | { status: 'failed'; error: HeatUnavailable }

type Result = { plan: Plan; attempt: number } & ({ grid: Grid; weather: HeatWeather } | { error: HeatUnavailable })

/** The heatmap's weather for a plan, fetched once per plan (and again on retry). */
export function useHeatWeather(plan: Plan | null): { heat: HeatState; retry: () => void } {
  const [result, setResult] = useState<Result | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!plan) return
    const controller = new AbortController()
    const grid = corridorGrid(plan)
    fetchHeatWeather(grid.cells, plan.trip.departure, controller.signal).then(
      weather => setResult({ plan, attempt, grid, weather }),
      (error: unknown) => {
        if (controller.signal.aborted) return
        setResult({ plan, attempt, error: error instanceof HeatUnavailable ? error : new HeatUnavailable('The weather layer could not load.') })
      },
    )
    return () => controller.abort()
  }, [plan, attempt])

  const retry = () => setAttempt(a => a + 1)
  if (!plan) return { heat: { status: 'off' }, retry }
  if (!result || result.plan !== plan || result.attempt !== attempt) return { heat: { status: 'loading' }, retry }
  return { heat: 'error' in result ? { status: 'failed', error: result.error } : { status: 'ready', grid: result.grid, weather: result.weather }, retry }
}
