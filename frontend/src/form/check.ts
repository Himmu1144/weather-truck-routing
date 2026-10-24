import type { PlaceResult } from '../api/types'
import { milesBetween } from '../lib/geo'
import { DEPARTURE_EARLIEST_MS, DEPARTURE_LATEST_MS } from '../lib/time'

export type Errors = Partial<Record<'origin' | 'destination' | 'departure' | 'load_lb', string>>

export const MAX_LOAD_LB = 80_000

/** The same checks the backend makes, so most mistakes are caught before a request. */
export function check(o: PlaceResult | null, d: PlaceResult | null, when: string, pounds: string, now = Date.now()): Errors {
  const found: Errors = {}
  const at = new Date(when).getTime()
  if (!o) found.origin = 'Pick a place from the list.'
  if (!d) found.destination = 'Pick a place from the list.'
  else if (o && milesBetween(o, d) < 1) found.destination = 'Origin and destination are the same place.'
  if (Number.isNaN(at)) found.departure = 'Pick a date and time.'
  else if (at < now + DEPARTURE_EARLIEST_MS) found.departure = 'Departure can’t be in the past.'
  else if (at > now + DEPARTURE_LATEST_MS) found.departure = 'Departure must be within the next 7 days, while forecasts cover the trip.'
  if (pounds === '') found.load_lb = 'Enter the load weight.'
  else if (Number(pounds) > MAX_LOAD_LB) found.load_lb = `At most ${MAX_LOAD_LB.toLocaleString('en-US')} lb.`
  return found
}
