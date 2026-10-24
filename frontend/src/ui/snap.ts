// Where the phone's bottom sheet comes to rest after a drag.

export const DRAG_START_PX = 6 // less than this is a tap, not a drag
export const SETTLE_PX = 60 // a drag this far flips the sheet; a shorter one springs back

/** `dy` is how far the finger moved (down is positive). Returns whether the sheet ends up full. */
export function settle(full: boolean, dy: number): boolean {
  if (full) return dy < SETTLE_PX
  return dy <= -SETTLE_PX
}

/** While dragging, the sheet follows the finger but never past either resting place. */
export function follow(full: boolean, dy: number, room: number): number {
  return full ? Math.min(Math.max(dy, 0), room) : Math.max(Math.min(dy, 0), -room)
}
