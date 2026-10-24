import { Box } from '@mui/material'
import type { ReactNode } from 'react'
import { hairline } from '../theme'

/** The frosted panel that floats over the map. */
export default function Panel({ children }: { children: ReactNode }) {
  return (
    <Box
      component="aside"
      sx={{
        position: 'absolute', top: 16, left: 16, bottom: 16, width: 400, zIndex: 2, overflow: 'hidden auto',
        borderRadius: '20px', bgcolor: 'rgba(255,255,255,.84)', backdropFilter: 'blur(20px) saturate(1.6)',
        outline: `1px solid ${hairline}`, boxShadow: '0 1px 2px rgba(16,24,40,.04), 0 24px 56px -16px rgba(16,24,40,.22)',
        scrollbarWidth: 'thin',
      }}
    >
      <Box sx={{ p: '26px 26px 28px' }}>{children}</Box>
    </Box>
  )
}
