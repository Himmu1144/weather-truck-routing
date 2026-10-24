import { Box, Stack, Typography } from '@mui/material'
import { useEffect, useState } from 'react'
import { api } from './api/client'
import { hairline, ink } from './theme'

// Step 1: the app shell and a check that the browser reaches Django through the dev proxy.
export default function App() {
  const [apiOk, setApiOk] = useState<boolean | null>(null)

  useEffect(() => {
    api.health().then(() => setApiOk(true), () => setApiOk(false))
  }, [])

  return (
    <Box sx={{ position: 'fixed', inset: 0, bgcolor: 'background.default' }}>
      <Box
        component="aside"
        sx={{
          position: 'absolute', top: 16, left: 16, bottom: 16, width: 400, p: 3.25, borderRadius: '20px',
          bgcolor: 'rgba(255,255,255,.84)', backdropFilter: 'blur(20px) saturate(1.6)',
          outline: `1px solid ${hairline}`, boxShadow: '0 24px 56px -16px rgba(16,24,40,.22)',
        }}
      >
        <Stack direction="row" spacing={1.1} sx={{ alignItems: 'center', mb: 3 }}>
          <Box component="img" src="/favicon.svg" alt="" sx={{ width: 22, height: 22 }} />
          <Typography variant="h3" sx={{ fontSize: 14, fontWeight: 600 }}>Weather Routing</Typography>
        </Stack>
        <Typography variant="overline" component="p">API</Typography>
        <Typography variant="body2" sx={{ color: apiOk === false ? '#da615a' : ink[2] }}>
          {apiOk === null ? 'Checking…' : apiOk ? 'Connected to Django.' : 'Django is not reachable on port 8000.'}
        </Typography>
      </Box>
    </Box>
  )
}
