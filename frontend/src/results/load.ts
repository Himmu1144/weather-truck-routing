import type { Route } from '../api/types'

// The brief's load rules, in words. The load always gets a line, even when it changes nothing,
// so the reader can see it was taken into account.
export function loadEffect(loadLb: number): string {
  if (loadLb > 40_000) return 'Wind of 35–44 mph counts as Severe and 45–54 mph as No Travel.'
  if (loadLb > 30_000) return 'Wind of 45–54 mph counts as No Travel.'
  return 'At 30,000 lb or less the load doesn’t change the wind limits.'
}

export function loadOnRoute(loadLb: number, route: Route): string {
  if (loadLb <= 30_000) return ''
  const raised = route.checkpoints.filter(c => c.load_raised_wind).length
  return raised
    ? `On Route ${route.id} it raised ${raised} checkpoint${raised > 1 ? 's' : ''}.`
    : `No checkpoint on Route ${route.id} reached those winds.`
}
