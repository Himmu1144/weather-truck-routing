// The trip in time: where the truck is at a given hour, what weather it meets when,
// and where each local midnight falls on the slider.
import type { Level, Route } from '../api/types'

export const SLIDER_HOURS = 48

const hoursAfter = (route: Route, iso: string) => (Date.parse(iso) - Date.parse(route.checkpoints[0].eta)) / 3.6e6

/** [hour, mile] points of the trip: checkpoints, plus a start and end for every rest (the truck stands still). */
function progress(route: Route): [number, number][] {
  const points: [number, number][] = route.checkpoints.map(c => [c.hours_after_departure, c.mile])
  for (const s of route.rest_stops) {
    const from = hoursAfter(route, s.starts)
    points.push([from, s.mile], [from + s.minutes / 60, s.mile])
  }
  points.push([route.travel_seconds / 3600, route.distance_mi])
  return points.sort((a, b) => a[0] - b[0] || a[1] - b[1])
}

/** The mile the truck has reached `hour` hours after departure; null once it has arrived. */
export function truckMile(route: Route, hour: number): number | null {
  const points = progress(route)
  if (hour >= points[points.length - 1][0]) return null
  for (let k = 1; k < points.length; k++) {
    const [h0, m0] = points[k - 1], [h1, m1] = points[k]
    if (hour <= h1) return h1 > h0 ? m0 + ((m1 - m0) * (hour - h0)) / (h1 - h0) : m1
  }
  return null
}

/** The time zone where the truck is at `hour`: the nearest checkpoint's, or the destination's once arrived. */
export function zoneAt(route: Route, hour: number): string {
  const mile = truckMile(route, hour)
  if (mile === null) return route.arrival_time_zone
  return route.checkpoints.reduce((a, c) => (Math.abs(c.mile - mile) < Math.abs(a.mile - mile) ? c : a)).time_zone
}

/** The weather the truck meets, hour by hour: each checkpoint's level until the next checkpoint. */
export function levelsInTime(route: Route): { from: number; to: number; level: Level }[] {
  const end = route.travel_seconds / 3600
  return route.checkpoints.map((c, k) => ({
    from: c.hours_after_departure, to: k + 1 < route.checkpoints.length ? route.checkpoints[k + 1].hours_after_departure : end, level: c.level,
  }))
}

/** Hours after departure at which local midnight falls in `timeZone`, within the slider. */
export function midnights(departure: string, timeZone: string): { hour: number; day: string }[] {
  const start = Date.parse(departure), found: { hour: number; day: string }[] = []
  const hourOf = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' })
  const dayOf = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' })
  for (let m = 0; m <= SLIDER_HOURS * 60; m += 15) {          // quarter-hour steps catch zones with :30 offsets
    const at = new Date(start + m * 60_000)
    if (hourOf.format(at) === '00:00' && m > 0) found.push({ hour: m / 60, day: dayOf.format(at) })
  }
  return found
}
