// The departure is typed in the viewer's own clock, which the browser knows for certain.
// Every time on the planned trip is then shown in the local time of its place.

const pad = (n: number) => String(n).padStart(2, '0')

/** A Date as the value of an <input type="datetime-local"> (the viewer's clock). */
export function toLocalInput(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** The next whole hour, the default departure. */
export function nextHour(now = new Date()): Date {
  const next = new Date(now)
  next.setHours(now.getHours() + 1, 0, 0, 0)
  return next
}

/** The viewer's time zone as people read it: "IST", "CDT", or "GMT+5:30" where there is no short name. */
export function viewerZone(at = new Date()): string {
  return new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(at)
    .find(part => part.type === 'timeZoneName')?.value ?? ''
}

// The window the backend accepts (trips/serializers.py): from an hour ago to 7 days ahead.
export const DEPARTURE_EARLIEST_MS = -60 * 60 * 1000
export const DEPARTURE_LATEST_MS = 7 * 24 * 60 * 60 * 1000
