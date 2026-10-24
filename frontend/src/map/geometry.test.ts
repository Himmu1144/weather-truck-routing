import { describe, expect, it } from 'vitest'
import type { Plan, Route } from '../api/types'
import { bounds, cardPlace, checkpointFeatures, labelMile, pointAt, routeFeatures, slice } from './geometry'

// A straight road east along 40°N: one vertex every 10 miles, 100 miles long.
function road(id: Route['id'], lat = 40, bend?: (mile: number) => number): Route {
  const line = Array.from({ length: 11 }, (_, k) => [-100 + k * 0.2, bend ? bend(k * 10) : lat, k * 10] as [number, number, number])
  return {
    id, line, distance_mi: 100,
    stretches: [{ start_mi: 0, end_mi: 35, level: 'low' }, { start_mi: 35, end_mi: 60, level: 'high' }, { start_mi: 60, end_mi: 100, level: 'low' }],
    checkpoints: [{ lon: -100, lat, level: 'low' }, { lon: -99, lat, level: 'high' }],
  } as unknown as Route
}

describe('map geometry', () => {
  it('finds the point at any mile, between vertices too', () => {
    expect(pointAt(road('A'), 25)).toEqual([-99.5, 40])
    expect(pointAt(road('A'), 0)).toEqual([-100, 40])
    expect(pointAt(road('A'), 100)[0]).toBeCloseTo(-98)
    expect(pointAt(road('A'), 150)[0]).toBeCloseTo(-98)   // past the end stays at the end
  })

  it('cuts a stretch exactly at its miles, so coloured stretches meet without gaps', () => {
    const part = slice(road('A'), 35, 60)
    expect(part[0][0]).toBeCloseTo(-99.3)
    expect(part.at(-1)![0]).toBeCloseTo(-98.8)
    expect(part.slice(1, -1).map(p => p[0])).toEqual([-99.2, -99].map(x => expect.closeTo(x)))   // miles 40 and 50
  })

  it('gives each route whole, plus one piece per risk stretch', () => {
    const plan = { routes: [road('A'), road('B', 41)] } as Plan
    const features = routeFeatures(plan).features
    expect(features.filter(f => f.properties.kind === 'whole')).toHaveLength(2)
    expect(features.filter(f => f.properties.kind === 'stretch').map(f => 'level' in f.properties && f.properties.level))
      .toEqual(['low', 'high', 'low', 'low', 'high', 'low'])
    expect(checkpointFeatures(road('A')).features.map(f => [f.id, f.properties.level])).toEqual([[0, 'low'], [1, 'high']])
    expect(bounds(plan)).toEqual([[-100, 40], [expect.closeTo(-98), 41]])
  })

  it('puts a route’s label where it runs furthest from the others', () => {
    // B runs on A for its first half, then swings north: its label goes on the northern half.
    const a = road('A'), b = road('B', 40, mile => (mile <= 50 ? 40 : 40 + (mile - 50) / 50))
    expect(labelMile(b, [a])).toBeGreaterThanOrEqual(65)
  })

  it('keeps a label off the rest stops', () => {
    const a = road('A'), b = road('B', 40, mile => (mile <= 50 ? 40 : 40 + (mile - 50) / 50))
    const best = labelMile(b, [a])
    expect(Math.abs(labelMile(b, [a], [best]) - best)).toBeGreaterThanOrEqual(6)
  })
})

describe('cardPlace', () => {
  const area = { width: 390, bottom: 340 }
  it('opens on the side with more room, so it stays clear of the slider', () => {
    expect(cardPlace(200, 100, area).below).toBe(true)
    expect(cardPlace(200, 255, area).below).toBe(false)
    // near the top of a short phone map, but with even less room below: still above
    expect(cardPlace(200, 200, area).below).toBe(false)
    expect(cardPlace(200, 200, { width: 1440, bottom: 900 }).below).toBe(true)
  })
  it('slides sideways to stay on screen', () => {
    expect(cardPlace(20, 200, area).left).toBe(126)
    expect(cardPlace(380, 200, area).left).toBe(264)
    expect(cardPlace(200, 200, area).left).toBe(200)
  })
})
