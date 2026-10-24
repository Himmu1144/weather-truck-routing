import { describe, expect, it } from 'vitest'
import type { Plan } from '../api/types'
import storm from '../test/fixtures/storm-plan.json'
import { levelsInTime, midnights, truckMile, zoneAt } from './trip'

const plan = storm as unknown as Plan
const b = plan.routes.find(r => r.id === 'B')!
const rest = b.rest_stops.find(s => s.kind === 'rest')!                     // the 10 h rest at mile 685
const restStarts = (Date.parse(rest.starts) - Date.parse(plan.trip.departure)) / 3.6e6

describe('the trip in time', () => {
  it('moves the truck along the route as the hours pass', () => {
    expect(truckMile(b, 0)).toBe(0)
    const c = b.checkpoints[10]
    expect(truckMile(b, c.hours_after_departure)).toBeCloseTo(c.mile, 0)
    expect(truckMile(b, b.travel_seconds / 3600 + 0.1)).toBeNull()          // arrived
  })

  it('keeps the truck still through a rest stop', () => {
    expect(truckMile(b, restStarts + 1)).toBeCloseTo(rest.mile, 1)
    expect(truckMile(b, restStarts + 9.9)).toBeCloseTo(rest.mile, 1)
    expect(truckMile(b, restStarts + 10.5)!).toBeGreaterThan(rest.mile)
  })

  it('reads the clock in the zone where the truck is', () => {
    expect(zoneAt(b, 0)).toBe('America/Chicago')
    expect(zoneAt(b, 40)).toBe('America/Denver')                              // arrived in Denver
  })

  it('lays the weather out in time, from departure to arrival', () => {
    const spans = levelsInTime(b)
    expect(spans[0].from).toBe(0)
    expect(spans.at(-1)!.to).toBeCloseTo(b.travel_seconds / 3600)
    expect(spans.some(s => s.level === 'moderate')).toBe(true)
  })

  it('marks each local midnight on the slider', () => {
    // leaves Sat 8:00 AM in Chicago: midnights at +16 h (Sun) and +40 h (Mon)
    expect(midnights('2026-10-24T13:00:00Z', 'America/Chicago')).toEqual([{ hour: 16, day: 'Sun' }, { hour: 40, day: 'Mon' }])
  })
})
