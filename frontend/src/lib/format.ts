/** "28 h 05 m": durations always in hours and minutes, so routes line up when compared. */
export function duration(seconds: number): string {
  let h = Math.floor(seconds / 3600), m = Math.round((seconds % 3600) / 60)
  if (m === 60) { h += 1; m = 0 }
  return `${h} h ${String(m).padStart(2, '0')} m`
}

export const miles = (mi: number) => `${Math.round(mi).toLocaleString('en-US')} mi`
