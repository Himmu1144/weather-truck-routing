import { Box } from '@mui/material'
import type { ReactNode } from 'react'
import { ink } from '../theme'
import { CARD_WIDTH, cardPlace, type CardArea } from './geometry'

const ANYWHERE: CardArea = { width: Infinity, bottom: Infinity }

/** The small card the map opens over a point, on whichever side has more room. */
export default function MapCard({ x, y, area = ANYWHERE, label, onClose, children }: { x: number; y: number; area?: CardArea; label: string; onClose?: () => void; children: ReactNode }) {
  const { left, below } = cardPlace(x, y, area)
  return (
    <Box role="dialog" aria-label={label}
      sx={{
        position: 'absolute', left, top: y, zIndex: 3, width: CARD_WIDTH, p: '12px 14px', borderRadius: '14px',
        transform: below ? 'translate(-50%, 16px)' : 'translate(-50%, calc(-100% - 16px))',
        bgcolor: 'rgba(255,255,255,.95)', backdropFilter: 'blur(12px)', pointerEvents: onClose ? 'auto' : 'none',
        boxShadow: '0 0 0 1px rgba(11,11,13,.07), 0 18px 40px -12px rgba(16,24,40,.35)',
      }}>
      {onClose && (
        <Box component="button" onClick={onClose} aria-label="Close"
          sx={{ all: 'unset', position: 'absolute', top: 10, right: 12, cursor: 'pointer', color: ink[3], fontSize: 16, lineHeight: 1, '&:hover': { color: ink.main } }}>×</Box>
      )}
      {children}
    </Box>
  )
}
