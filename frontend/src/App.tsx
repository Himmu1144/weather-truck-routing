import { Box, Button, Stack, Typography } from '@mui/material'
import TripForm from './form/TripForm'
import FailedNote from './plan/FailedNote'
import { fieldErrors } from './plan/messages'
import PlanningView from './plan/PlanningView'
import ResultStub from './plan/ResultStub'
import { usePlan } from './plan/usePlan'
import Panel from './ui/Panel'

export default function App() {
  const { state, start, retry, cancel } = usePlan()
  const editing = state.status === 'idle' || state.status === 'failed'

  return (
    <Box sx={{ position: 'fixed', inset: 0, bgcolor: 'background.default' }}>
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
        {state.status === 'done' && <ResultStub plan={state.plan} />}
        {/* kept mounted while planning, so going back finds the form as it was */}
        <Box sx={{ display: editing ? 'block' : 'none' }}>
          <TripForm onSubmit={start} serverErrors={state.status === 'failed' ? fieldErrors(state.error) : undefined} />
        </Box>
      </Panel>
    </Box>
  )
}
