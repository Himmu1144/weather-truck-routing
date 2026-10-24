import { Box, Stack, Typography } from '@mui/material'
import { useState } from 'react'
import type { PlanRequest } from './api/types'
import TripForm from './form/TripForm'
import Panel from './ui/Panel'

export default function App() {
  // Step 2: the form hands over a checked request; step 3 sends it to the API.
  const [request, setRequest] = useState<PlanRequest | null>(null)

  return (
    <Box sx={{ position: 'fixed', inset: 0, bgcolor: 'background.default' }}>
      <Panel>
        <Stack direction="row" spacing={1.1} sx={{ alignItems: 'center', mb: 3.25 }}>
          <Box component="img" src="/favicon.svg" alt="" sx={{ width: 22, height: 22 }} />
          <Typography variant="h3" sx={{ fontSize: 14, fontWeight: 600 }}>Weather Routing</Typography>
        </Stack>
        <TripForm onSubmit={setRequest} />
        {request && (
          <Box component="pre" data-testid="request" sx={{ mt: 3, fontSize: 11, whiteSpace: 'pre-wrap', color: 'text.secondary' }}>
            {JSON.stringify(request, null, 2)}
          </Box>
        )}
      </Panel>
    </Box>
  )
}
