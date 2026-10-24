import { describe, expect, it } from 'vitest'
import type { PlaceResult } from '../api/types'
import { check } from './check'

const NOW = new Date('2026-10-24T12:00:00Z').getTime()
const HOUR = 3600_000
const chicago: PlaceResult = { label: 'Chicago, IL', lat: 41.85, lon: -87.65, kind: 'town' }
const denver: PlaceResult = { label: 'Denver, CO', lat: 39.74, lon: -104.98, kind: 'town' }
const at = (ms: number) => new Date(NOW + ms).toISOString()

describe('check', () => {
  it('passes a good trip', () => {
    expect(check(chicago, denver, at(HOUR), '45000', NOW)).toEqual({})
  })

  it('needs both places, and two different ones', () => {
    expect(check(null, null, at(HOUR), '45000', NOW)).toEqual({
      origin: 'Pick a place from the list.', destination: 'Pick a place from the list.',
    })
    const nextDoor = { ...chicago, label: 'Chicago Loop', lat: 41.855 }   // about a third of a mile away
    expect(check(chicago, nextDoor, at(HOUR), '45000', NOW).destination).toBe('Origin and destination are the same place.')
  })

  it('takes departures from an hour ago to 7 days ahead, as the server does', () => {
    expect(check(chicago, denver, at(-0.9 * HOUR), '45000', NOW)).toEqual({})
    expect(check(chicago, denver, at(-1.1 * HOUR), '45000', NOW).departure).toMatch(/past/)
    expect(check(chicago, denver, at(7 * 24 * HOUR - 60_000), '45000', NOW)).toEqual({})
    expect(check(chicago, denver, at(7 * 24 * HOUR + 60_000), '45000', NOW).departure).toMatch(/7 days/)
    expect(check(chicago, denver, '', '45000', NOW).departure).toBe('Pick a date and time.')
  })

  it('takes loads from 0 to 80,000 lb', () => {
    expect(check(chicago, denver, at(HOUR), '0', NOW)).toEqual({})
    expect(check(chicago, denver, at(HOUR), '80000', NOW)).toEqual({})
    expect(check(chicago, denver, at(HOUR), '80001', NOW).load_lb).toBe('At most 80,000 lb.')
    expect(check(chicago, denver, at(HOUR), '', NOW).load_lb).toBe('Enter the load weight.')
  })
})
