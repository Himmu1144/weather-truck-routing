import { describe, expect, it } from 'vitest'
import type { Plan } from '../api/types'
import storm from '../test/fixtures/storm-plan.json'
import { levelAfter, timeline } from './timeline'

const plan = storm as unknown as Plan
const routeA = plan.routes.find(r => r.id === 'A')!

describe('timeline', () => {
  const rows = timeline(routeA)

  it('starts at departure and ends at arrival', () => {
    expect(rows[0]).toMatchObject({ kind: 'depart', mile: 0 })
    expect(rows.at(-1)).toMatchObject({ kind: 'arrive', at: routeA.arrival, zone: 'America/Denver' })
  })

  it('folds calm checkpoints in a row into one line, and keeps every other checkpoint', () => {
    const calm = rows.filter(r => r.kind === 'calm')
    const shown = rows.filter(r => r.kind === 'checkpoint')
    const folded = calm.reduce((n, r) => n + (r.kind === 'calm' ? r.count : 0), 0)
    expect(folded + shown.length).toBe(routeA.checkpoints.length)
    // every checkpoint above Low gets its own row: none is ever folded away
    expect(shown.map(r => r.kind === 'checkpoint' && r.checkpoint.mile))
      .toEqual(routeA.checkpoints.filter(c => c.level !== 'low').map(c => c.mile))
    expect(rows.some((r, i) => r.kind === 'calm' && rows[i + 1]?.kind === 'calm')).toBe(false)
  })

  it('keeps rows in mile order with the rest stops in place', () => {
    const middle = rows.slice(1, -1)
    expect(middle.map(r => r.mile)).toEqual([...middle.map(r => r.mile)].sort((a, b) => a - b))
    expect(rows.filter(r => r.kind === 'rest').map(r => r.kind === 'rest' && r.stop.kind)).toEqual(['break', 'rest'])
  })

  it('colours the line below a row by the weather the truck drives into next', () => {
    const i = rows.findIndex((_, k) => rows[k + 1]?.kind === 'checkpoint')
    const next = rows[i + 1]
    expect(levelAfter(rows, i)).toBe(next.kind === 'checkpoint' && next.checkpoint.level)
    expect(levelAfter(rows, rows.length - 1)).toBe('low')
  })
})
