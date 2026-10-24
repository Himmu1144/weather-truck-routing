import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Cell } from './grid'
import { fetchHeatWeather, HOURS, requestUrl } from './weather'

const cells = (n: number): Cell[] => Array.from({ length: n }, (_, k) => ({ i: 0, j: k, lon: -100 + k * 0.1, lat: 40 }))
const START = Date.UTC(2026, 9, 24, 13) / 1000
const answer = (wind: number, hours = HOURS) => ({
  hourly: {
    time: Array.from({ length: hours }, (_, t) => START + t * 3600),
    wind_speed_10m: Array.from({ length: hours }, (_, t) => (t === 5 ? null : wind)),
    rain: Array(hours).fill(0.1), showers: Array(hours).fill(0.05), snowfall: Array(hours).fill(0),
  },
})

describe('heatmap weather', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('asks for hours 0 to 48 from the departure hour, in mph and inches', () => {
    const url = new URL(requestUrl(cells(2), START))
    expect(url.searchParams.get('start_hour')).toBe('2026-10-24T13:00')
    expect(url.searchParams.get('end_hour')).toBe('2026-10-26T13:00')
    expect(url.searchParams.get('wind_speed_unit')).toBe('mph')
    expect(url.searchParams.get('latitude')).toBe('40,40')
  })

  it('reads every place in order across batches, rain plus showers, gaps as zero', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      const n = new URL(String(input)).searchParams.get('latitude')!.split(',').length
      const first = Number(new URL(String(input)).searchParams.get('longitude')!.split(',')[0])
      return new Response(JSON.stringify(Array.from({ length: n }, (_, k) => answer(Math.round((first + 100) * 10) + k, HOURS + 1))))
    })
    const weather = await fetchHeatWeather(cells(250), '2026-10-24T13:20:00Z')
    expect(fetch).toHaveBeenCalledTimes(2)                     // 200 + 50
    expect(weather.wind[249 * weather.hours]).toBe(249)                // the last place got its own forecast
    expect(weather.wind[5]).toBe(0)                            // a missing value
    expect(weather.rain[0]).toBeCloseTo(0.15)
    expect(weather.offset).toBeCloseTo(1 / 3)                  // departure 20 minutes past the hour
  })

  it('fetches the extra bracketing hour for +48 h after a fractional departure', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      const url = new URL(String(input))
      const hours = (Date.parse(url.searchParams.get('end_hour')! + ':00Z') / 1000 - START) / 3600 + 1
      const data = answer(10, hours)
      data.hourly.wind_speed_10m = Array.from({ length: hours }, (_, h) => 10 + h)
      return new Response(JSON.stringify([data, answer(90, hours)]))
    })
    const weather = await fetchHeatWeather(cells(2), '2026-10-24T13:30:00Z')
    expect(new URL(String(fetch.mock.calls[0][0])).searchParams.get('end_hour')).toBe('2026-10-26T14:00')
    expect(weather.hours).toBe(50)
    expect(weather.offset).toBe(0.5)
    expect(weather.wind[48]).toBe(58)
    expect(weather.wind[49]).toBe(59)
    expect(weather.wind[weather.hours + 49]).toBe(90)   // the next cell has its own stride
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('needs only 49 hours for a whole-hour departure', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(answer(10))))
    const weather = await fetchHeatWeather(cells(1), '2026-10-24T13:00:00Z')
    expect(weather.hours).toBe(49)
    expect(weather.wind.length).toBe(49)
    expect(new URL(String(fetch.mock.calls[0][0])).searchParams.get('end_hour')).toBe('2026-10-26T13:00')
  })

  it('tells a busy service from a used-up daily limit', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ reason: 'Minutely API request limit exceeded.' }), { status: 429 }))
    await expect(fetchHeatWeather(cells(1), '2026-10-24T13:00:00Z')).rejects.toMatchObject({ busy: true })
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ reason: 'Daily API request limit exceeded.' }), { status: 429 }))
    await expect(fetchHeatWeather(cells(1), '2026-10-24T13:00:00Z')).rejects.toMatchObject({ busy: false })
  })
})
