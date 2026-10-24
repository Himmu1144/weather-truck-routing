/** "28 h 05 m": durations always in hours and minutes, so routes line up when compared. */
export function duration(seconds: number): string {
  let h = Math.floor(seconds / 3600), m = Math.round((seconds % 3600) / 60)
  if (m === 60) { h += 1; m = 0 }
  return `${h} h ${String(m).padStart(2, '0')} m`
}

export const miles = (mi: number) => `${Math.round(mi).toLocaleString('en-US')} mi`

/** A moment in the local time of its place: { time: 'Sun 11:31 AM', zone: 'MDT' }. */
export function localTime(iso: string, timeZone: string): { time: string; zone: string } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
    .formatToParts(new Date(iso))
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value ?? ''
  return { time: `${get('weekday')} ${get('hour')}:${get('minute')} ${get('dayPeriod')}`, zone: get('timeZoneName') }
}

export const at = (iso: string, timeZone: string) => { const t = localTime(iso, timeZone); return `${t.time} ${t.zone}` }

/** "+29 m", "+1 h 05 m": how much longer than the fastest route. */
export function extra(seconds: number): string {
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `+${minutes} m`
  return `+${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} m`
}
