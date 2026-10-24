// The few icons the app needs, drawn inline instead of pulling in an icon package.
const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

export const ArrowIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="M3 8h10m0 0L9 4m4 4-4 4" {...stroke} /></svg>
)
export const PinIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden><path d="M8 14.5s4.5-4 4.5-7.5a4.5 4.5 0 1 0-9 0c0 3.5 4.5 7.5 4.5 7.5z" {...stroke} /><circle cx="8" cy="7" r="1.5" {...stroke} /></svg>
)
export const TownIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden><path d="M2.5 14V7l3.5-2.5L9.5 7v7m0-5h4v5M1.5 14h13M5 10h2" {...stroke} /></svg>
)
