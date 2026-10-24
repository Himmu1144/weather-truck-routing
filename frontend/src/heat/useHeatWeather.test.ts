import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Plan } from '../api/types'
import storm from '../test/fixtures/storm-plan.json'
import { useHeatWeather } from './useHeatWeather'
import * as weather from './weather'

describe('useHeatWeather', () => {
  it('fetches once per trip: flipping rest breaks reuses the weather', async () => {
    const fetch = vi.spyOn(weather, 'fetchHeatWeather').mockResolvedValue({ start: 0, offset: 0, wind: new Float32Array(), rain: new Float32Array(), snow: new Float32Array() })
    const plan = storm as unknown as Plan
    const { result, rerender } = renderHook(({ p }) => useHeatWeather(p), { initialProps: { p: plan } })
    await waitFor(() => expect(result.current.heat.status).toBe('ready'))

    rerender({ p: { ...plan, trip: { ...plan.trip, rest_breaks: false } } })      // the same trip, planned non-stop
    expect(result.current.heat.status).toBe('ready')
    rerender({ p: { ...plan, trip: { ...plan.trip, departure: '2026-10-25T13:00:00Z' } } })   // another departure: new weather
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
  })
})
