import { Box, Button, Stack, Typography } from '@mui/material'
import { lazy, Suspense, useState } from 'react'
import type { Plan, Route } from './api/types'
import TripForm from './form/TripForm'
import FailedNote from './plan/FailedNote'
import { fieldErrors } from './plan/messages'
import PlanningView from './plan/PlanningView'
import ResultStub from './plan/ResultStub'
import { usePlan } from './plan/usePlan'
import Panel from './ui/Panel'

// MapLibre is large: it loads after the form is on screen, and the form never waits for it.
const TripMap = lazy(() => import('./map/TripMap'))
const PANEL_PADDING = { left: 440, top: 0, right: 0, bottom: 0 }

export default function App() {
  const { state, start, retry, cancel } = usePlan()
  const editing = state.status === 'idle' || state.status === 'failed'
  const plan = state.status === 'done' ? state.plan : null
  // The recommended route is selected for each new plan, until the user picks another.
  const [choice, setChoice] = useState<{ plan: Plan; id: Route['id'] } | null>(null)
  const selected = plan ? (choice?.plan === plan ? choice.id : plan.recommendation.route_id) : null
  const select = (id: Route['id']) => plan && setChoice({ plan, id })

  return (
    <Box sx={{ position: 'fixed', inset: 0, bgcolor: 'background.default' }}>
      <Suspense fallback={null}>
        <TripMap plan={plan} selected={selected} onSelect={select} padding={PANEL_PADDING} />
      </Suspense>
      <Panel>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 3.25 }}>
          <Stack direction="row" spacing={1.1} sx={{ alignItems: 'center' }}>
            <Box component="img" src="/favicon.svg" alt="" sx={{ width: 22, height: 22 }} />
            <Typography variant="h3" sx={{ fontSize: 14, fontWeight: 600 }}>Weather Routing</Typography>
          </Stack>
          {state.status === 'done' && <Button size="small" onClick={cancel} sx={{ color: 'text.secondary' }}>New trip</Button>}
        </Stack>

        {state.status === 'failed' && <FailedNote error={state.error} onRetry={retry} />}
        {(state.status === 'planning' || state.status === 'waiting') && (
          <PlanningView {...state} onCancel={cancel} onRetryNow={retry} />
        )}
        {plan && selected && <ResultStub plan={plan} selected={selected} onSelect={select} />}
        {/* kept mounted while planning, so going back finds the form as it was */}
        <Box sx={{ display: editing ? 'block' : 'none' }}>
          <TripForm onSubmit={start} serverErrors={state.status === 'failed' ? fieldErrors(state.error) : undefined} />
        </Box>
      </Panel>
    </Box>
  )
}
