import { Box, Button, Typography } from '@mui/material'
import type { ApiError } from '../api/client'
import { ink } from '../theme'
import { describe } from './messages'

export default function FailedNote({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  const { title, detail, canRetry } = describe(error)
  return (
    <Box role="alert" sx={{ mb: 3, p: 2, borderRadius: '0 12px 12px 0', bgcolor: 'rgba(11,11,13,.04)', borderLeft: `3px solid ${ink.main}` }}>
      <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{title}</Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>{detail}</Typography>
      {canRetry && <Button size="small" variant="outlined" onClick={onRetry} sx={{ mt: 1.5 }}>Try again</Button>}
    </Box>
  )
}
