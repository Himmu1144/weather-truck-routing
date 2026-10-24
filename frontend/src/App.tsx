import { Box, Button, Stack, Typography } from '@mui/material'
import { lazy, Suspense, useCallback, useMemo, useState } from 'react'
import type { Plan, Route } from './api/types'
import type { Focus } from './map/TripMap'
import type { HeatView } from './heat/layer'
import { useHeatWeather } from './heat/useHeatWeather'
import { pointAt } from './map/geometry'
import TimeBar from './timebar/TimeBar'
import { truckMile } from './timebar/trip'
import TripForm from './form/TripForm'
import FailedNote from './plan/FailedNote'
import { fieldErrors } from './plan/messages'
import PlanningView from './plan/PlanningView'
import { usePlan } from './plan/usePlan'
import Results from './results/Results'
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
  const select = useCallback((id: Route['id']) => { if (plan) setChoice({ plan, id }) }, [plan])
  const [focus, setFocus] = useState<Focus | null>(null)
  const focusOn = useCallback((mile: number) => setFocus(f => ({ mile, seq: (f?.seq ?? 0) + 1 })), [])
  const { heat, retry: retryHeat } = useHeatWeather(plan)
  // The slider's hour: back to departure for each new plan.
  const [time, setTime] = useState<{ plan: Plan; hour: number } | null>(null)
  const hour = plan && time?.plan === plan ? time.hour : 0
  const setHour = useCallback((h: number) => { if (plan) setTime({ plan, hour: h }) }, [plan])
  const [view, setView] = useState<HeatView>('risk')
  const route = plan?.routes.find(r => r.id === selected)
  const mile = route ? truckMile(route, hour) : null
  const truck = useMemo(() => (route && mile !== null ? pointAt(route, mile) : null), [route, mile])

  return (
    <Box sx={{ position: 'fixed', inset: 0, bgcolor: 'background.default' }}>
      <Suspense fallback={null}>
        <TripMap plan={plan} selected={selected} onSelect={select} focus={focus} heat={heat} hour={hour} view={view} truck={truck} padding={PANEL_PADDING} />
      </Suspense>
      {plan && route && (
        <Box sx={{ position: 'absolute', zIndex: 2, bottom: 22, left: `calc(${PANEL_PADDING.left}px + (100% - ${PANEL_PADDING.left}px) / 2)`,
          transform: 'translateX(-50%)', width: `min(720px, calc(100% - ${PANEL_PADDING.left + 48}px))` }}>
          <TimeBar route={route} departure={plan.trip.departure} loadLb={plan.trip.load_lb} hour={hour} onHour={setHour}
            view={view} onView={setView} heat={heat} onRetryHeat={retryHeat} />
        </Box>
      )}
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
        {plan && selected && <Results plan={plan} selected={selected} onSelect={select} onFocus={focusOn} />}
        {/* kept mounted while planning, so going back finds the form as it was */}
        <Box sx={{ display: editing ? 'block' : 'none' }}>
          <TripForm onSubmit={start} serverErrors={state.status === 'failed' ? fieldErrors(state.error) : undefined} />
        </Box>
      </Panel>
    </Box>
  )
}
