// The heatmap's weather, fetched by the viewer's browser straight from Open-Meteo, so the
// viewers' own quota pays for it rather than the server's shared one (decision D-08).
import type { Cell } from './grid'

export const HOURS = 49                  // whole-hour departure: hour 0 to hour 48
const URL_BASE = 'https://api.open-meteo.com/v1/forecast'
const BATCH = 200                        // locations per request, keeping each URL a sensible length
const HOUR_S = 3600

export interface HeatWeather {
  start: number        // unix seconds of the first hour: departure rounded down to the hour
  offset: number       // hours from that first hour to the departure (0 to 1)
  hours: number        // 49, or 50 to bracket hour 48 of a fractional departure
  wind: Float32Array   // mph, cell-major: cell k's hour h at [k * hours + h]
  rain: Float32Array   // in/hr, rain plus showers, as the backend reads it
  snow: Float32Array   // in/hr
}

export class HeatUnavailable extends Error {
  readonly busy: boolean
  constructor(message: string, busy = false) {
    super(message)
    this.busy = busy
  }
}

const isoHour = (unix: number) => new Date(unix * 1000).toISOString().slice(0, 13) + ':00'

export function requestUrl(cells: Cell[], start: number, hours = HOURS): string {
  return `${URL_BASE}?${new URLSearchParams({
    latitude: cells.map(c => c.lat).join(','), longitude: cells.map(c => c.lon).join(','),
    hourly: 'wind_speed_10m,rain,showers,snowfall', wind_speed_unit: 'mph', precipitation_unit: 'inch',
    timezone: 'GMT', timeformat: 'unixtime', start_hour: isoHour(start), end_hour: isoHour(start + (hours - 1) * HOUR_S),
  })}`
}

type Answer = { hourly: { time: number[]; wind_speed_10m: (number | null)[]; rain: (number | null)[]; showers: (number | null)[]; snowfall: (number | null)[] } }

export async function fetchHeatWeather(cells: Cell[], departure: string, signal?: AbortSignal): Promise<HeatWeather> {
  const leaves = new Date(departure).getTime() / 1000
  const start = Math.floor(leaves / HOUR_S) * HOUR_S
  const offset = (leaves - start) / HOUR_S
  const hours = HOURS + (offset > 0 ? 1 : 0)
  const batches = Array.from({ length: Math.ceil(cells.length / BATCH) }, (_, b) => cells.slice(b * BATCH, (b + 1) * BATCH))
  const answers = await Promise.all(batches.map(async batch => {
    let response: Response
    try {
      response = await fetch(requestUrl(batch, start, hours), { signal })
    } catch (error) {
      if (signal?.aborted) throw error
      throw new HeatUnavailable('The weather service could not be reached.')
    }
    if (response.status === 429) {
      // Same refusal for the per-minute and the daily limit; only the minute one clears by waiting.
      const reason = String((await response.json().catch(() => ({})))?.reason ?? '').toLowerCase()
      if (reason.includes('daily') || reason.includes('hourly')) throw new HeatUnavailable('The free weather service has reached its limit for today.')
      throw new HeatUnavailable('The free weather service is busy.', true)
    }
    if (!response.ok) throw new HeatUnavailable('The weather service could not give this forecast.')
    const data = (await response.json()) as Answer | Answer[]
    return Array.isArray(data) ? data : [data]
  }))

  const wind = new Float32Array(cells.length * hours), rain = new Float32Array(cells.length * hours), snow = new Float32Array(cells.length * hours)
  answers.flat().forEach((answer, k) => {
    const h = answer.hourly
    for (let t = 0; t < hours; t++) {
      const i = h.time.indexOf(start + t * HOUR_S)
      if (i < 0) continue
      wind[k * hours + t] = h.wind_speed_10m[i] ?? 0
      rain[k * hours + t] = (h.rain[i] ?? 0) + (h.showers[i] ?? 0)
      snow[k * hours + t] = h.snowfall[i] ?? 0
    }
  })
  return { start, offset, hours, wind, rain, snow }
}
