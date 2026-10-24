import { Box, ButtonBase } from '@mui/material'
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { ease, hairline } from '../theme'
import { DRAG_START_PX, follow, settle } from './snap'

export interface SheetMode {
  full: boolean
  onFull: (full: boolean) => void
  peek: number // px of the sheet showing while it peeks
}

const glass = {
  bgcolor: 'rgba(255,255,255,.84)', backdropFilter: 'blur(20px) saturate(1.6)', outline: `1px solid ${hairline}`, overflow: 'hidden',
}

/** The frosted panel that floats over the map. On a phone with a plan it becomes a sheet over the bottom
 *  of the map: peeking, it shows the answer; dragged up (or its handle tapped) it shows everything.
 *  One component for both, so switching never remounts the form inside. */
export default function Panel({ sheet, children }: { sheet?: SheetMode; children: ReactNode }) {
  const box = useRef<HTMLElement>(null)
  const handle = useRef<HTMLButtonElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const drag = useRef<{ y: number; room: number; moved: boolean } | null>(null)
  const [dy, setDy] = useState<number | null>(null) // set while a finger drags the sheet
  const full = sheet?.full ?? false

  // Back to peeking: show the answer again, not wherever the list was scrolled to.
  useEffect(() => { if (sheet && !full) content.current?.scrollTo({ top: 0 }) }, [sheet, full])

  const down = (e: PointerEvent) => {
    // Full, the content scrolls, so only the handle drags; peeking, the whole sheet does.
    if (!sheet || (full && !handle.current?.contains(e.target as Node))) return
    drag.current = { y: e.clientY, room: (box.current?.offsetHeight ?? 0) - sheet.peek, moved: false }
  }
  const move = (e: PointerEvent) => {
    const d = drag.current
    if (!d) return
    const off = e.clientY - d.y
    if (!d.moved && Math.abs(off) < DRAG_START_PX) return
    if (!d.moved) { d.moved = true; e.currentTarget.setPointerCapture(e.pointerId) }
    setDy(follow(full, off, d.room))
  }
  const up = () => {
    const d = drag.current
    drag.current = null
    if (!d?.moved) return
    sheet?.onFull(settle(full, dy ?? 0))
    setDy(null)
  }

  return (
    <Box ref={box} component="aside" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      sx={sheet ? {
        ...glass, bgcolor: 'rgba(255,255,255,.92)',
        position: 'absolute', left: 0, right: 0, bottom: 0, height: '88%', zIndex: 3, display: 'flex', flexDirection: 'column',
        transform: `translateY(calc(${full ? '0px' : `100% - ${sheet.peek}px`} + ${dy ?? 0}px))`,
        transition: dy === null ? `transform .45s ${ease}` : 'none',
        touchAction: full ? 'auto' : 'none',
        borderRadius: '20px 20px 0 0', boxShadow: '0 -12px 40px -16px rgba(16,24,40,.28)',
      } : {
        ...glass,
        // as tall as its content, up to the full height (then it scrolls); full width on a phone
        position: 'absolute', top: 16, left: 16, right: { xs: 16, md: 'auto' }, maxHeight: 'calc(100% - 32px)', width: { md: 400 }, zIndex: 2,
        display: 'flex', flexDirection: 'column',
        borderRadius: '20px', boxShadow: '0 1px 2px rgba(16,24,40,.04), 0 24px 56px -16px rgba(16,24,40,.22)',
      }}>
      {sheet && (
        <ButtonBase ref={handle} onClick={() => sheet.onFull(!full)} aria-label={full ? 'Show less' : 'Show the whole plan'} aria-expanded={full}
          sx={{ flex: 'none', height: 26, width: 1, touchAction: 'none' }}>
          <Box sx={{ width: 38, height: 4, borderRadius: 2, bgcolor: 'rgba(11,11,13,.18)' }} />
        </ButtonBase>
      )}
      <Box ref={content} sx={{
        flex: '1 1 auto', minHeight: 0, scrollbarWidth: 'thin', overscrollBehavior: 'contain',
        overflow: sheet && !full ? 'hidden' : 'hidden auto',
        p: sheet ? '4px 20px calc(28px + env(safe-area-inset-bottom))' : { xs: '22px 20px 24px', md: '26px 26px 28px' },
      }}>
        {children}
      </Box>
    </Box>
  )
}
