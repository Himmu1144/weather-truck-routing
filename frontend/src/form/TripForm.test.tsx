import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { PlanRequest } from '../api/types'
import TripForm from './TripForm'

vi.mock('../api/client', () => ({ api: { places: vi.fn().mockResolvedValue({ results: [] }) } }))

// The app keeps the rest-break setting; this stands in for it.
function Form({ onSubmit }: { onSubmit: (r: PlanRequest) => void }) {
  const [restBreaks, setRestBreaks] = useState(true)
  return <TripForm onSubmit={onSubmit} restBreaks={restBreaks} onRestBreaks={setRestBreaks} />
}

describe('TripForm', () => {
  it('does not send an incomplete trip, and says what is missing', async () => {
    const onSubmit = vi.fn()
    render(<Form onSubmit={onSubmit} />)
    await userEvent.click(screen.getByRole('button', { name: /plan trip/i }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getAllByText('Pick a place from the list.')).toHaveLength(2)
  })

  it('plans a sample trip in one click, as the API expects it', async () => {
    const onSubmit = vi.fn()
    render(<Form onSubmit={onSubmit} />)
    await userEvent.click(screen.getByRole('button', { name: /Chicago → Denver/ }))
    expect(onSubmit).toHaveBeenCalledWith({
      origin: { label: 'Chicago, IL', lat: 41.85003, lon: -87.65005 },
      destination: { label: 'Denver, CO', lat: 39.73915, lon: -104.9847 },
      departure: expect.any(String),
      load_lb: 45_000,
      interval_mi: 25,
      rest_breaks: true,
    })
    // the next whole hour on the viewer's clock
    const leaves = new Date(onSubmit.mock.calls[0][0].departure)
    expect(leaves.getMinutes()).toBe(0)
    expect(leaves.getTime() - Date.now()).toBeGreaterThan(0)
    expect(leaves.getTime() - Date.now()).toBeLessThanOrEqual(3600_000)
  })

  it('sends non-stop ETAs when legal rest breaks are switched off', async () => {
    const onSubmit = vi.fn()
    render(<Form onSubmit={onSubmit} />)
    await userEvent.click(screen.getByRole('switch', { name: 'Legal rest breaks' }))
    expect(screen.getByText('Off: ETAs assume non-stop driving')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Chicago → Denver/ }))
    expect(onSubmit.mock.calls[0][0].rest_breaks).toBe(false)
  })
})
