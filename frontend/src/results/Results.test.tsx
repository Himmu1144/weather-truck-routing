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
})
