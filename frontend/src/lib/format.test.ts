import { describe, expect, it } from 'vitest'
import { duration, extra, localTime } from './format'

describe('format', () => {
  it('shows a moment in its place’s own time and zone', () => {
    expect(localTime('2026-10-25T17:31:57Z', 'America/Denver')).toEqual({ time: 'Sun 11:31 AM', zone: 'MDT' })
    expect(localTime('2026-10-24T13:00:00Z', 'America/Chicago')).toEqual({ time: 'Sat 8:00 AM', zone: 'CDT' })
  })

  it('writes durations and differences in hours and minutes', () => {
    expect(duration(102_717)).toBe('28 h 32 m')
    expect(duration(3_599)).toBe('1 h 00 m')
    expect(extra(29 * 60)).toBe('+29 m')
    expect(extra(65 * 60)).toBe('+1 h 05 m')
  })
})
