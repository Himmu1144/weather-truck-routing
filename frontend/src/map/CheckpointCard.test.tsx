import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Plan } from '../api/types'
import storm from '../test/fixtures/storm-plan.json'
import CheckpointCard from './CheckpointCard'

const plan = storm as unknown as Plan
const severe = plan.routes.find(r => r.id === 'A')!.checkpoints.find(c => c.load_raised_wind)!

describe('CheckpointCard', () => {
  it('shows when the truck is there in local time, the weather then, and the cause', () => {
    render(<CheckpointCard checkpoint={severe} x={500} y={400} />)
    expect(screen.getByText('Severe')).toBeInTheDocument()
    expect(screen.getByText(`Mile ${severe.mile} · Sun 5:50 AM CDT · +${severe.hours_after_departure.toFixed(1)} h`)).toBeInTheDocument()
    expect(screen.getByText(`${severe.wind_mph.toFixed(1)} mph`)).toBeInTheDocument()
    expect(screen.getByText(/with a 45,000 lb load/)).toBeInTheDocument()   // the load raised it, so the card says how
    expect(screen.getByText('Wind').closest('tr')).toHaveStyle({ fontWeight: '600' })   // the cause is in bold
    expect(screen.getByText('Rain').closest('tr')).not.toHaveStyle({ fontWeight: '600' })
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()   // a hover card can't be clicked
  })

  it('a pinned card can be closed', async () => {
    const onClose = vi.fn()
    render(<CheckpointCard checkpoint={severe} x={500} y={400} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
  })
})
