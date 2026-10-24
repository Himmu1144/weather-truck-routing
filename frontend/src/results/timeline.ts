import type { Checkpoint, Level, RestStop, Route } from '../api/types'

// What the driver meets along a route, in mile order. Calm checkpoints in a row fold
// into one line, so the rows that need attention stand out.
export type Row =
  | { kind: 'depart' | 'arrive'; mile: number; at: string; zone: string }
  | { kind: 'calm'; mile: number; to: number; count: number } // mile: the first calm checkpoint
  | { kind: 'checkpoint'; mile: number; checkpoint: Checkpoint }
  | { kind: 'rest'; mile: number; stop: RestStop }

export function timeline(route: Route): Row[] {
  const events: Row[] = [
    ...route.checkpoints.map(c => ({ kind: 'checkpoint' as const, mile: c.mile, checkpoint: c })),
    ...route.rest_stops.map(s => ({ kind: 'rest' as const, mile: s.mile, stop: s })),
  ].sort((a, b) => a.mile - b.mile)

  const first = route.checkpoints[0]
  const rows: Row[] = [{ kind: 'depart', mile: 0, at: first.eta, zone: first.time_zone }]
  let calm: number[] = []
  const fold = () => {
    if (calm.length) rows.push({ kind: 'calm', mile: calm[0], to: calm[calm.length - 1], count: calm.length })
    calm = []
  }
  for (const e of events) {
    if (e.kind === 'checkpoint' && e.checkpoint.level === 'low') {
      calm.push(e.mile)
      continue
    }
    fold()
    rows.push(e)
  }
  fold()
  rows.push({ kind: 'arrive', mile: route.distance_mi, at: route.arrival, zone: route.arrival_time_zone })
  return rows
}

/** The level the truck drives into after a row: what colours the line below it. */
export function levelAfter(rows: Row[], index: number): Level {
  const next = rows[index + 1]
  return next?.kind === 'checkpoint' ? next.checkpoint.level : 'low'
}
