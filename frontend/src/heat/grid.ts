// The heatmap's grid: weather points around the routes, and how far each spot is from a route
// (the GPU uses that to fade the heatmap out at the corridor's edge).
import type { Plan } from '../api/types'

export const REACH_KM = 85          // grid points this close to a route; the heatmap fades out from 48 to 82 km
export const MAX_POINTS = 400       // one fetch stays well under Open-Meteo's 600 locations a minute
const STEPS = [0.35, 0.4, 0.5, 0.75, 1]  // degrees; a long trip takes the first spacing that fits
const PAD = 1.2                     // degrees around the routes, so the grid extends past the fade
const FIELD_WIDTH = 256             // distance-texture pixels across

export interface Cell { i: number; j: number; lon: number; lat: number } // row i (from south), column j (from west)
export interface Grid {
  step: number
  box: [west: number, south: number, east: number, north: number]
  rows: number
  cols: number
  cells: Cell[]
  distance: { width: number; height: number; values: Uint8Array } // 0..255 = 0..100 km to the nearest route, row 0 south
}

type Segment = [number, number, number, number] // lon, lat, lon, lat

const KM_PER_DEG_LAT = 110.57
function segmentKm(lon: number, lat: number, [ax, ay, bx, by]: Segment): number {
  const k = Math.cos((lat * Math.PI) / 180) * 111.32
  const px = (lon - ax) * k, py = (lat - ay) * KM_PER_DEG_LAT, dx = (bx - ax) * k, dy = (by - ay) * KM_PER_DEG_LAT
  const length = dx * dx + dy * dy
  const t = length ? Math.max(0, Math.min(1, (px * dx + py * dy) / length)) : 0
  return Math.hypot(px - t * dx, py - t * dy)
}

function segments(plan: Plan): Segment[] {
  return plan.routes.flatMap(route => {
    const every = Math.max(1, Math.floor(route.line.length / 250)) // about 250 points a route is plenty at this scale
    const line = route.line.filter((_, k) => k % every === 0 || k === route.line.length - 1)
    return line.slice(1).map((b, k) => [line[k][0], line[k][1], b[0], b[1]] as Segment)
  })
}

/** Km from (lon, lat) to the nearest route; segments more than 2° away are skipped. */
function nearestKm(lon: number, lat: number, all: Segment[]): number {
  let best = Infinity
  for (const s of all) {
    if (Math.min(s[0], s[2]) - 2 > lon || Math.max(s[0], s[2]) + 2 < lon || Math.min(s[1], s[3]) - 2 > lat || Math.max(s[1], s[3]) + 2 < lat) continue
    best = Math.min(best, segmentKm(lon, lat, s))
  }
  return best
}

export function corridorGrid(plan: Plan, maxPoints = MAX_POINTS): Grid {
  const all = segments(plan)
  const lons = all.flatMap(s => [s[0], s[2]]), lats = all.flatMap(s => [s[1], s[3]])
  const west = Math.min(...lons) - PAD, south = Math.min(...lats) - PAD
  const east = Math.max(...lons) + PAD, north = Math.max(...lats) + PAD

  let grid: Omit<Grid, 'distance'> | null = null
  for (const step of STEPS) {
    const rows = Math.ceil((north - south) / step), cols = Math.ceil((east - west) / step)
    const cells: Cell[] = []
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const lon = west + (j + 0.5) * step, lat = south + (i + 0.5) * step
        if (nearestKm(lon, lat, all) < REACH_KM) cells.push({ i, j, lon: round(lon), lat: round(lat) })
      }
    }
    grid = { step, box: [west, south, west + cols * step, south + rows * step], rows, cols, cells }
    if (cells.length <= maxPoints) break
  }
  const g = grid!
  const [w, s, e, n] = g.box
  const width = FIELD_WIDTH
  const height = Math.max(8, Math.round((width * (n - s)) / ((e - w) * Math.cos((((s + n) / 2) * Math.PI) / 180))))
  const values = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const km = nearestKm(w + ((x + 0.5) / width) * (e - w), s + ((y + 0.5) / height) * (n - s), all)
      values[y * width + x] = Math.min(255, Math.round((km / 100) * 255))
    }
  }
  return { ...g, distance: { width, height, values } }
}

const round = (x: number) => Math.round(x * 1000) / 1000
