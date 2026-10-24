import { describe, expect, it, vi } from 'vitest'
import type { Grid } from './grid'
import { fieldTexture, heatLayer } from './layer'
import { HOURS, type HeatWeather } from './weather'

// A 3 x 3 grid with weather only in the middle cell: wind = 10 + hour.
const grid = { rows: 3, cols: 3, step: 0.4, box: [0, 0, 1.2, 1.2], cells: [{ i: 1, j: 1, lon: 0.6, lat: 0.6 }] } as unknown as Grid
const weather: HeatWeather = {
  start: 0, offset: 0, hours: HOURS,
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

describe('fractional departure', () => {
  const hours = HOURS + 1
  const forecast: HeatWeather = {
    start: 0, offset: 0.5, hours,
    wind: Float32Array.from({ length: hours * 2 }, (_, k) => k < hours ? 10 + k : 90),
    rain: new Float32Array(hours * 2), snow: new Float32Array(hours * 2),
  }
  const twoCells = { ...grid, cells: [...grid.cells, { i: 1, j: 2, lon: 1, lat: 0.6 }], distance: { width: 1, height: 1, values: new Uint8Array(1) } }

  it('packs both bracketing hours with the correct stride for every cell', () => {
    const data = fieldTexture(twoCells, forecast)
    const wind = (h: number, j: number) => data[((h * 3 + 1) * 3 + j) * 4]
    expect(data.length).toBe(3 * 3 * 50 * 4)
    expect(wind(48, 1)).toBe(58)
    expect(wind(49, 1)).toBe(59)
    expect(wind(48, 2)).toBe(90)
    expect(wind(49, 2)).toBe(90)
  })

  it('sends 48.5 and all 50 hours to the shader without fetching when the slider moves', () => {
    const uniform1f = vi.fn(), uniform1i = vi.fn(), shaderSource = vi.fn(), texImage2D = vi.fn()
    const gl = new Proxy({ uniform1f, uniform1i, shaderSource, texImage2D,
      getUniformLocation: (_: unknown, name: string) => name,
      getShaderParameter: () => true,
    }, { get: (target, key) => key in target ? target[key as keyof typeof target] : vi.fn() }) as unknown as WebGL2RenderingContext
    const map = { triggerRepaint: vi.fn() }
    const layer = heatLayer(twoCells, forecast, 0)
    layer.onAdd!(map as never, gl)
    layer.setHour(48)
    layer.render!(gl, { defaultProjectionData: { mainMatrix: new Float32Array(16) } } as never)
    expect(uniform1f).toHaveBeenCalledWith('uHour', 48.5)
    expect(uniform1i).toHaveBeenCalledWith('uHours', 50)
    expect(shaderSource.mock.calls[1][1]).toContain('h1 = min(h0 + 1, uHours - 1)')
    expect(texImage2D.mock.calls[1][4]).toBe(3 * 50)
    const uploads = texImage2D.mock.calls.length
    layer.setHour(24)
    layer.render!(gl, { defaultProjectionData: { mainMatrix: new Float32Array(16) } } as never)
    expect(texImage2D).toHaveBeenCalledTimes(uploads)
    expect(map.triggerRepaint).toHaveBeenCalledTimes(2)
  })
})
