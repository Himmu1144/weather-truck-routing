import { Box, Button, Stack, Typography } from '@mui/material'
import { keyframes } from '@mui/material/styles'
import type { PlanRequest } from '../api/types'
import { useNow } from '../lib/useNow'
import { ease, ink } from '../theme'
import Eyebrow from '../ui/Eyebrow'
import { MAX_ATTEMPTS } from './usePlan'

const slide = keyframes`from { transform: translateX(-100%) } to { transform: translateX(290%) }`
const SLOW_AFTER_S = 8

type Props = { request: PlanRequest; onCancel: () => void; onRetryNow: () => void } & (
  | { status: 'planning'; since: number; attempt: number }
  | { status: 'waiting'; until: number; wait: number; attempt: number }
)

/** While the server plans: what it is doing, for how long, and a way out. The server answers
 *  in one request, so the text describes the whole job rather than pretending to know the step. */
export default function PlanningView(props: Props) {
  const now = useNow()
  const { request } = props
  return (
    <Box aria-live="polite">
      <Eyebrow>{props.status === 'waiting' ? 'Waiting for the weather service' : 'Planning'}</Eyebrow>
      <Typography sx={{ fontWeight: 600, fontSize: 15, letterSpacing: '-.01em' }}>
        {request.origin.label}<Box component="span" sx={{ color: ink[3], mx: 0.75 }}>→</Box>{request.destination.label}
      </Typography>

      <Box sx={{ height: 2, bgcolor: 'rgba(11,11,13,.07)', borderRadius: 1, overflow: 'hidden', my: 2.75 }}>
        {props.status === 'planning'
          ? <Box sx={{ height: 1, width: '35%', bgcolor: ink.main, animation: `${slide} 1.4s ${ease} infinite` }} />
          : <Box sx={{ height: 1, bgcolor: ink[3], transition: 'width .25s linear',
              width: `${Math.max(0, Math.min(100, ((props.until - now) / props.wait) * 100))}%` }} />}
      </Box>

      {props.status === 'planning' ? (
        <>
          <Typography sx={{ color: ink[2], fontSize: 14 }}>Finding truck routes and reading the forecast at every checkpoint.</Typography>
          <Typography variant="caption" component="p" sx={{ mt: 0.75 }}>
            {Math.floor((now - props.since) / 1000)} s
            {(now - props.since) / 1000 > SLOW_AFTER_S && ' · long trips take longer: each route has hundreds of checkpoints'}
            {props.attempt > 1 && ` · attempt ${props.attempt} of ${MAX_ATTEMPTS}`}
          </Typography>
        </>
      ) : (
        <>
          <Typography sx={{ color: ink[2], fontSize: 14 }}>
            The free weather service allows a limited number of forecasts a minute and asked us to wait.
          </Typography>
          <Typography variant="caption" component="p" sx={{ mt: 0.75 }}>
            Trying again in {Math.max(0, Math.ceil((props.until - now) / 1000))} s · attempt {props.attempt + 1} of {MAX_ATTEMPTS}
          </Typography>
        </>
      )}

      <Stack direction="row" spacing={1} sx={{ mt: 3 }}>
        {props.status === 'waiting' && <Button variant="outlined" color="primary" onClick={props.onRetryNow}>Try now</Button>}
        <Button color="primary" onClick={props.onCancel} sx={{ color: ink[2] }}>Cancel</Button>
      </Stack>
    </Box>
  )
}
