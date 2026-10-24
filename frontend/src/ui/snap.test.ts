import { describe, expect, it } from 'vitest'
import { follow, settle, SETTLE_PX } from './snap'

describe('settle', () => {
  it('opens a peeking sheet only on a long enough drag up', () => {
    expect(settle(false, -SETTLE_PX)).toBe(true)
    expect(settle(false, -SETTLE_PX + 1)).toBe(false)
    expect(settle(false, 200)).toBe(false) // down from peek stays peek
  })
  it('closes a full sheet only on a long enough drag down', () => {
    expect(settle(true, SETTLE_PX)).toBe(false)
    expect(settle(true, SETTLE_PX - 1)).toBe(true)
    expect(settle(true, -200)).toBe(true)
  })
})

describe('follow', () => {
  it('keeps the sheet between its two resting places', () => {
    expect(follow(false, -50, 400)).toBe(-50)
    expect(follow(false, -900, 400)).toBe(-400)
    expect(follow(false, 30, 400)).toBe(0)
    expect(follow(true, 50, 400)).toBe(50)
    expect(follow(true, 900, 400)).toBe(400)
    expect(follow(true, -30, 400)).toBe(0)
  })
})
