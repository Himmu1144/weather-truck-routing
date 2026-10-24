import { describe, expect, it } from 'vitest'
import type { Plan, Route } from '../api/types'
import storm from '../test/fixtures/storm-plan.json'
import { corridorGrid, MAX_POINTS } from './grid'

const plan = storm as unknown as Plan

describe('corridorGrid', () => {
  const grid = corridorGrid(plan)

  it('keeps one fetch under the limit, at the finest spacing that fits', () => {
    expect(grid.cells.length).toBeLessThanOrEqual(MAX_POINTS)
    expect(grid.step).toBe(0.4)   // 0.35° would be 452 points
    expect(grid.cells.length).toBeGreaterThan(200)
  })

  it('takes points along the routes and none far from them', () => {
    const near = (lon: number, lat: number) => grid.cells.some(c => Math.abs(c.lon - lon) < grid.step && Math.abs(c.lat - lat) < grid.step)
    expect(near(-98.0, 39.8)).toBe(true)     // on Route B in Kansas
    expect(near(-100, 35)).toBe(false)       // the Texas Panhandle, hundreds of km south
    for (const c of grid.cells) {
      expect(c.lon).toBeCloseTo(grid.box[0] + (c.j + 0.5) * grid.step, 3)
      expect(c.lat).toBeCloseTo(grid.box[1] + (c.i + 0.5) * grid.step, 3)
    }
  })

  it('gives a long trip a coarser grid rather than too many points', () => {
    const coast: Route = { ...plan.routes[0], line: Array.from({ length: 300 }, (_, k) => [-122 + k * 0.17, 37 + Math.sin(k / 40), k * 9.4] as [number, number, number]) }
    const long = corridorGrid({ ...plan, routes: [coast] })
    expect(long.step).toBeGreaterThan(0.35)
    expect(long.cells.length).toBeLessThanOrEqual(MAX_POINTS)
  })

  it('measures the distance to the nearest route for the fade at the corridor edge', () => {
    const { width, height, values } = grid.distance
    const at = (lon: number, lat: number) => {
      const [w, s, e, n] = grid.box
      return values[Math.floor(((lat - s) / (n - s)) * height) * width + Math.floor(((lon - w) / (e - w)) * width)] / 255 * 100
    }
    expect(at(-97.96, 39.8)).toBeLessThan(10)    // Route B's 10 h rest stop
    expect(at(grid.box[0] + 0.05, grid.box[1] + 0.05)).toBe(100)  // the far corner: 100 km or more
  })
})
