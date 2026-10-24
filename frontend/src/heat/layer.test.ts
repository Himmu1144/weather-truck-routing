import { describe, expect, it } from 'vitest'
import type { Grid } from './grid'
import { fieldTexture } from './layer'
import { HOURS, type HeatWeather } from './weather'

// A 3 x 3 grid with weather only in the middle cell: wind = 10 + hour.
const grid = { rows: 3, cols: 3, step: 0.4, box: [0, 0, 1.2, 1.2], cells: [{ i: 1, j: 1, lon: 0.6, lat: 0.6 }] } as unknown as Grid
const weather: HeatWeather = {
  start: 0, offset: 0,
  wind: Float32Array.from({ length: HOURS }, (_, h) => 10 + h), rain: new Float32Array(HOURS).fill(0.2), snow: new Float32Array(HOURS),
}

describe('fieldTexture', () => {
  const data = fieldTexture(grid, weather)
  const at = (h: number, i: number, j: number) => Array.from(data.slice(((h * 3 + i) * 3 + j) * 4, ((h * 3 + i) * 3 + j) * 4 + 3))

  it('stacks the hours: each hour is a full grid, hour after hour', () => {
    expect(data.length).toBe(3 * 3 * HOURS * 4)
    expect(at(0, 1, 1)[0]).toBe(10)
    expect(at(48, 1, 1)[0]).toBe(58)
  })

  it('fills the empty cells around the corridor from their neighbours', () => {
    expect(at(7, 0, 1)).toEqual([17, expect.closeTo(0.2), 0])   // next to the known cell
    expect(at(7, 0, 0)).toEqual([17, expect.closeTo(0.2), 0])   // a corner, filled on the second pass
  })
})
