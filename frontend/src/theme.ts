import { createTheme } from '@mui/material/styles'
import type { Level } from './api/types'

// The interface has no colour of its own: near-black, greys and white.
// Colour is kept for weather risk, so a glance at the screen says where the danger is.
export const ink = { main: '#0b0b0d', 2: '#4b4b53', 3: '#8b8b94', 4: '#b9b9c0' }
export const hairline = 'rgba(11, 11, 13, .07)'
export const ease = 'cubic-bezier(.16, 1, .3, 1)'

export const LEVELS: Level[] = ['low', 'moderate', 'high', 'severe', 'no_travel']
export const LEVEL_NAMES: Record<Level, string> = {
  low: 'Low', moderate: 'Moderate', high: 'High', severe: 'Severe', no_travel: 'No Travel',
}
// Solid colours for the panel and map lines; the heatmap uses the same hues, see-through.
export const RISK: Record<Level, string> = {
  low: '#cfe3e4', moderate: '#ebc764', high: '#ee9a5b', severe: '#da615a', no_travel: '#8c55a8',
}

const display = '"Space Grotesk", Inter, system-ui, sans-serif'

export const theme = createTheme({
  palette: {
    primary: { main: ink.main, contrastText: '#fff' },
    text: { primary: ink.main, secondary: ink[2], disabled: ink[4] },
    divider: hairline,
    background: { default: '#f4f4f2', paper: '#fff' },
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: 'Inter, system-ui, sans-serif',
    h1: { fontFamily: display, fontWeight: 600, fontSize: 32, lineHeight: 1.08, letterSpacing: '-.03em' },
    h2: { fontFamily: display, fontWeight: 600, fontSize: 46, lineHeight: 1, letterSpacing: '-.035em' },
    h3: { fontFamily: display, fontWeight: 500, fontSize: 17, letterSpacing: '-.01em' },
    overline: { fontSize: 10.5, fontWeight: 600, letterSpacing: '.16em', lineHeight: 1.5, color: ink[3] },
    body2: { fontSize: 13.5 },
    caption: { fontSize: 12, color: ink[3] },
    button: { textTransform: 'none', fontWeight: 500 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        // fixed-width figures, so numbers don't jump while the slider moves
        body: { fontFeatureSettings: '"tnum" 1, "cv11" 1', WebkitFontSmoothing: 'antialiased' },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { borderRadius: 13 } },
    },
  },
})
