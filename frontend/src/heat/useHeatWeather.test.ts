import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Plan } from '../api/types'
import storm from '../test/fixtures/storm-plan.json'
import { heatKey, useHeatWeather } from './useHeatWeather'
import * as weather from './weather'

describe('useHeatWeather', () => {
  afterEach(() => { vi.restoreAllMocks() })
  it('fetches once per trip: flipping rest breaks reuses the weather', async () => {
    const fetch = vi.spyOn(weather, 'fetchHeatWeather').mockResolvedValue({ start: 0, offset: 0, hours: 49, wind: new Float32Array(), rain: new Float32Array(), snow: new Float32Array() })
    const plan = storm as unknown as Plan
    const { result, rerender } = renderHook(({ p }) => useHeatWeather(p), { initialProps: { p: plan } })
    await waitFor(() => expect(result.current.heat.status).toBe('ready'))

    rerender({ p: { ...plan, trip: { ...plan.trip, rest_breaks: false } } })      // the same trip, planned non-stop
    expect(result.current.heat.status).toBe('ready')
    for (let h = 0; h <= 48; h++) rerender({ p: plan })   // slider rerenders keep the same plan
    expect(fetch).toHaveBeenCalledTimes(1)
    rerender({ p: { ...plan, trip: { ...plan.trip, departure: '2026-10-25T13:00:00Z' } } })   // another departure: new weather
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
  })
})

describe('heatmap cache', () => {
  afterEach(() => { vi.restoreAllMocks() })
  const plan = storm as unknown as Plan
  const changedCorridor = (p: Plan): Plan => ({ ...p, routes: p.routes.map((r, k) => k ? r : {
    ...r, line: r.line.map((point, i) => i === 1 ? [point[0] + 1, point[1], point[2]] : point),
  }) })
  const forecast: weather.HeatWeather = { start: 0, offset: 0, hours: 49, wind: new Float32Array(), rain: new Float32Array(), snow: new Float32Array() }

  it('keys departure and geometry even when ids, distances, point counts and endpoints match', () => {
    expect(heatKey(changedCorridor(plan))).not.toBe(heatKey(plan))
    expect(heatKey({ ...plan, trip: { ...plan.trip, departure: '2027-01-01T10:30:00Z' } })).not.toBe(heatKey(plan))
    expect(heatKey({ ...plan, trip: { ...plan.trip, rest_breaks: !plan.trip.rest_breaks } })).toBe(heatKey(plan))
  })

  it('fetches new weather for a different corridor with the same route metadata', async () => {
    const fetch = vi.spyOn(weather, 'fetchHeatWeather').mockResolvedValue(forecast)
    const trip = { ...plan, trip: { ...plan.trip, departure: '2027-01-02T10:30:00Z' } }
    const { result, rerender } = renderHook(({ p }) => useHeatWeather(p), { initialProps: { p: trip } })
    await waitFor(() => expect(result.current.heat.status).toBe('ready'))
    rerender({ p: changedCorridor(trip) })
    await waitFor(() => expect(result.current.heat.status).toBe('ready'))
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('reuses the cache before 30 minutes and refetches when it expires', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000)
    const fetch = vi.spyOn(weather, 'fetchHeatWeather').mockResolvedValue(forecast)
    const trip = { ...plan, trip: { ...plan.trip, departure: '2027-01-03T10:30:00Z' } }
    const { result, rerender } = renderHook(({ p }) => useHeatWeather(p), { initialProps: { p: trip } })
    await waitFor(() => expect(result.current.heat.status).toBe('ready'))
    now.mockReturnValue(1000 + 30 * 60 * 1000 - 1)
    const nonstop = { ...trip, trip: { ...trip.trip, rest_breaks: false } }
    rerender({ p: nonstop })
    expect(result.current.heat.status).toBe('ready')
    expect(fetch).toHaveBeenCalledTimes(1)
    now.mockReturnValue(1000 + 30 * 60 * 1000)
    rerender({ p: nonstop })   // moving the slider after expiry still uses the active forecast
    expect(result.current.heat.status).toBe('ready')
    expect(fetch).toHaveBeenCalledTimes(1)
    rerender({ p: { ...trip } })
    await waitFor(() => expect(result.current.heat.status).toBe('ready'))
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
