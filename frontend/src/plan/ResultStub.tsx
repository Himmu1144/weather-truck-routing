import { Box, Typography } from '@mui/material'
import type { Plan, Route } from '../api/types'
import { duration, miles } from '../lib/format'
import { ink } from '../theme'
import Eyebrow from '../ui/Eyebrow'

/** Temporary: the plan in plain text, until the results panel (step 5) replaces it. */
export default function ResultStub({ plan, selected, onSelect }: { plan: Plan; selected: Route['id']; onSelect: (id: Route['id']) => void }) {
  return (
    <Box>
      <Eyebrow>Recommended</Eyebrow>
      <Typography variant="h2" sx={{ mb: 1.5 }}>Route {plan.recommendation.route_id}</Typography>
      <Typography variant="body2" sx={{ color: ink[2], mb: 3 }}>{plan.recommendation.reason}</Typography>
      {plan.routes.map(r => (
        <Typography key={r.id} variant="body2" onClick={() => onSelect(r.id)}
          sx={{ py: 0.75, borderTop: '1px solid rgba(11,11,13,.07)', cursor: 'pointer', fontWeight: r.id === selected ? 600 : 400 }}>
          Route {r.id} · {r.via} · {duration(r.travel_seconds)} · {miles(r.distance_mi)}
        </Typography>
      ))}
      <Typography variant="caption" component="p" sx={{ mt: 2 }}>Planned in {(plan.meta.timings_ms.total / 1000).toFixed(1)} s</Typography>
    </Box>
  )
}
