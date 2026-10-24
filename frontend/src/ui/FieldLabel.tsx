import { Typography } from '@mui/material'
import type { ReactNode } from 'react'

export default function FieldLabel({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <Typography component="label" htmlFor={htmlFor} variant="overline"
      sx={{ display: 'block', fontSize: 10, letterSpacing: '.14em', mb: 0.25 }}>
      {children}
    </Typography>
  )
}
