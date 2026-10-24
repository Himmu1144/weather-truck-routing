import { Box, Typography } from '@mui/material'
import type { Plan } from '../api/types'
import { ink } from '../theme'
import Eyebrow from '../ui/Eyebrow'

const hours = (s: number) => `${Math.floor(s / 3600)} h ${String(Math.round((s % 3600) / 60)).padStart(2, '0')} m`

/** Temporary: the plan in plain text, until the results panel (step 5) replaces it. */
export default function ResultStub({ plan }: { plan: Plan }) {
  return (
    <Box>
      <Eyebrow>Recommended</Eyebrow>
      <Typography variant="h2" sx={{ mb: 1.5 }}>Route {plan.recommendation.route_id}</Typography>
      <Typography variant="body2" sx={{ color: ink[2], mb: 3 }}>{plan.recommendation.reason}</Typography>
      {plan.routes.map(r => (
        <Typography key={r.id} variant="body2" sx={{ py: 0.75, borderTop: '1px solid rgba(11,11,13,.07)' }}>
          Route {r.id} · {r.via} · {hours(r.travel_seconds)} · {Math.round(r.distance_mi).toLocaleString('en-US')} mi
        </Typography>
      ))}
      <Typography variant="caption" component="p" sx={{ mt: 2 }}>Planned in {(plan.meta.timings_ms.total / 1000).toFixed(1)} s</Typography>
    </Box>
  )
}
