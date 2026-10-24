import { describe, expect, it } from 'vitest'
import { nextHour, toLocalInput } from './time'

describe('time helpers', () => {
  it('defaults the departure to the next whole hour', () => {
    const at = nextHour(new Date(2026, 9, 24, 20, 37, 12))
    expect(toLocalInput(at)).toBe('2026-10-24T21:00')
    expect(toLocalInput(nextHour(new Date(2026, 9, 31, 23, 5)))).toBe('2026-11-01T00:00')   // over midnight and a month end
  })
})
