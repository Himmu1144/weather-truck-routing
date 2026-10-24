import { describe, expect, it } from 'vitest'
import type { Plan } from '../api/types'
import storm from '../test/fixtures/storm-plan.json'
import { loadEffect, loadOnRoute } from './load'

const plan = storm as unknown as Plan
const route = (id: string) => plan.routes.find(r => r.id === id)!

describe('load wording', () => {
  it('follows the brief’s “more than” edges', () => {
    expect(loadEffect(30_000)).toMatch(/doesn’t change/)
    expect(loadEffect(30_001)).toBe('Wind of 45–54 mph counts as No Travel.')
    expect(loadEffect(40_000)).toBe('Wind of 45–54 mph counts as No Travel.')
    expect(loadEffect(40_001)).toBe('Wind of 35–44 mph counts as Severe and 45–54 mph as No Travel.')
  })

  it('says what the load changed on the route, even when nothing', () => {
    expect(loadOnRoute(45_000, route('A'))).toBe('On Route A it raised 3 checkpoints.')
    expect(loadOnRoute(45_000, route('B'))).toBe('No checkpoint on Route B reached those winds.')
    expect(loadOnRoute(20_000, route('A'))).toBe('')
  })
})
