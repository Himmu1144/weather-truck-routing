// Plan data as map shapes. Plain functions, so they are tested without a browser.
import type { Level, Plan, Route } from '../api/types'

type Position = [number, number]
type Feature<G, P> = { type: 'Feature'; id?: number; geometry: G; properties: P }
type LineString = { type: 'LineString'; coordinates: Position[] }
type Point = { type: 'Point'; coordinates: Position }
export type RouteFeature = Feature<LineString, { id: Route['id']; kind: 'whole' } | { id: Route['id']; kind: 'stretch'; level: Level }>
export type CheckpointFeature = Feature<Point, { index: number; level: Level }>

/** The point `mile` miles along the route (the line carries the mile of each vertex). */
export function pointAt(route: Route, mile: number): Position {
  const line = route.line
  let k = 1
  while (k < line.length - 1 && line[k][2] < mile) k++
  const [lonA, latA, mileA] = line[k - 1], [lonB, latB, mileB] = line[k]
  const t = Math.min(1, Math.max(0, (mile - mileA) / Math.max(1e-9, mileB - mileA)))
  return [lonA + (lonB - lonA) * t, latA + (latB - latA) * t]
}

/** The part of the route between two miles, cut exactly at both ends. */
export function slice(route: Route, from: number, to: number): Position[] {
  const inside = route.line.filter(([, , mile]) => mile > from && mile < to).map(([lon, lat]) => [lon, lat] as Position)
  return [pointAt(route, from), ...inside, pointAt(route, to)]
}

/** Each route whole (drawn grey when not selected), and cut into its risk stretches (drawn in colour when selected). */
export function routeFeatures(plan: Plan): { type: 'FeatureCollection'; features: RouteFeature[] } {
  return {
    type: 'FeatureCollection',
    features: plan.routes.flatMap(route => [
      { type: 'Feature', geometry: { type: 'LineString', coordinates: route.line.map(([lon, lat]) => [lon, lat] as Position) }, properties: { id: route.id, kind: 'whole' } },
      ...route.stretches.map((s): RouteFeature => ({
        type: 'Feature', geometry: { type: 'LineString', coordinates: slice(route, s.start_mi, s.end_mi) }, properties: { id: route.id, kind: 'stretch', level: s.level },
      })),
    ] as RouteFeature[]),
  }
}

export function checkpointFeatures(route: Route): { type: 'FeatureCollection'; features: CheckpointFeature[] } {
  return {
    type: 'FeatureCollection',
    features: route.checkpoints.map((c, index) => ({
      type: 'Feature', id: index, geometry: { type: 'Point', coordinates: [c.lon, c.lat] }, properties: { index, level: c.level },
    })),
  }
}

/** Where to put a route's label: the mile, between 30% and 70% of the way, that is furthest from the
 *  other routes and not on top of a rest stop (`avoid`, in miles). */
export function labelMile(route: Route, others: Route[], avoid: number[] = []): number {
  const near = (p: Position) => Math.min(Infinity, ...others.flatMap(o => o.line.filter((_, i) => i % 4 === 0)
    .map(([lon, lat]) => Math.hypot((lon - p[0]) * Math.cos((lat * Math.PI) / 180), lat - p[1]))))
  let best = route.distance_mi / 2, bestGap = -1
  for (let f = 0.3; f <= 0.7001; f += 0.05) {
    const mile = route.distance_mi * f
    if (avoid.some(a => Math.abs(a - mile) < route.distance_mi * 0.06)) continue
    const gap = near(pointAt(route, mile))
    if (gap > bestGap) { bestGap = gap; best = mile }
  }
  return best
}

/** [[west, south], [east, north]] around every route. */
export function bounds(plan: Plan): [Position, Position] {
  const lons = plan.routes.flatMap(r => r.line.map(p => p[0])), lats = plan.routes.flatMap(r => r.line.map(p => p[1]))
  return [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]]
}
