import { Box } from '@mui/material'
import type { Route } from '../api/types'
import { RISK } from '../theme'

/** The route as a thin bar, each stretch as long as its miles, in its risk colour. */
export default function RiskStrip({ route, height = 6 }: { route: Route; height?: number }) {
  return (
    <Box sx={{ display: 'flex', gap: '1.5px', height, borderRadius: height / 2, overflow: 'hidden' }} aria-hidden>
      {route.stretches.map(s => (
        <Box key={s.start_mi} sx={{ flex: s.end_mi - s.start_mi, bgcolor: RISK[s.level] }} />
      ))}
    </Box>
  )
}
