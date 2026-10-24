import { Box, Typography } from '@mui/material'
import type { ReactNode } from 'react'

/** A small spaced-out label with a short line in front: "—— RECOMMENDED". */
export default function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <Typography variant="overline" component="div" sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1.75 }}>
      <Box component="span" sx={{ width: 18, height: '1px', bgcolor: 'currentColor' }} />
      {children}
    </Typography>
  )
}
