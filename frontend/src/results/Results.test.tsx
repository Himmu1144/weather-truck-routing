import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Plan } from '../api/types'
import storm from '../test/fixtures/storm-plan.json'
import Results from './Results'

const plan = storm as unknown as Plan

describe('Results', () => {
  it('leads with the recommendation, its reason and arrival in local time', () => {
    render(<Results plan={plan} selected="B" onSelect={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Route B' })).toBeInTheDocument()
    expect(screen.getByText(plan.recommendation.reason)).toBeInTheDocument()
    expect(screen.getByText('Sun 11:31 AM')).toBeInTheDocument()
    expect(screen.getByText('MDT · with rest stops')).toBeInTheDocument()
    expect(screen.getByText('75 mi Moderate · 1,003 mi Low')).toBeInTheDocument()   // every level present, worst first
  })

  it('lists every route by rank, and a click selects one', async () => {
    const onSelect = vi.fn()
    render(<Results plan={plan} selected="B" onSelect={onSelect} />)
    const rows = screen.getAllByRole('button', { pressed: undefined }).filter(b => b.hasAttribute('aria-pressed'))
    expect(rows.map(r => within(r).getByText(/^Route [ABC]/).textContent?.slice(0, 7))).toEqual(['Route B', 'Route C', 'Route A'])
    expect(within(rows[2]).getByText('75 mi Severe')).toBeInTheDocument()
    expect(within(rows[2]).getByText('Fastest')).toBeInTheDocument()
    await userEvent.click(rows[2])
    expect(onSelect).toHaveBeenCalledWith('A')
  })

  it('explains why a selected route was not chosen, and what the load did on it', () => {
    render(<Results plan={plan} selected="A" onSelect={vi.fn()} />)
    expect(screen.getByText(`Route A not chosen: ${plan.routes[0].not_chosen}`)).toBeInTheDocument()
    expect(screen.getByText(/On Route A it raised 3 checkpoints\./)).toBeInTheDocument()
    expect(screen.getByText('Along route A')).toBeInTheDocument()
  })

  it('a timeline row shows its mile on the map', async () => {
    const onFocus = vi.fn()
    render(<Results plan={plan} selected="B" onSelect={vi.fn()} onFocus={onFocus} />)
    await userEvent.click(screen.getByRole('button', { name: 'Show mile 675 on the map' }))
    expect(onFocus).toHaveBeenCalledWith(675)
  })

  it('plans the same trip again when legal rest breaks are switched off', async () => {
    const onRestBreaks = vi.fn()
    render(<Results plan={plan} selected="B" onSelect={vi.fn()} onRestBreaks={onRestBreaks} />)
    expect(screen.getByText('Legal rest breaks included')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('switch', { name: 'Legal rest breaks' }))
    expect(onRestBreaks).toHaveBeenCalledWith(false)
  })

  it('compares with the same trip planned non-stop', () => {
    const b = plan.routes.find(r => r.id === 'B')!
    const nonStop = { ...plan, trip: { ...plan.trip, rest_breaks: false },
      routes: plan.routes.map(r => (r.id === 'B' ? { ...r, travel_seconds: b.drive_seconds, arrival: '2026-10-25T07:01:00Z' } : r)) }
    render(<Results plan={plan} selected="B" onSelect={vi.fn()} twin={nonStop as Plan} />)
    expect(screen.getByText('Non-stop, Route B would arrive Sun 1:01 AM MDT, 10 h 30 m earlier, but not legally.')).toBeInTheDocument()
  })
})
