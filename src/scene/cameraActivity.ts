/**
 * Transient camera flag: OrbitControls knows the camera moved, the keyboard
 * handler needs it, and neither belongs in the document store.
 */

let moved = false

export const markCameraMoved = () => {
  moved = true
}

export const consumeCameraMoved = () => {
  const m = moved
  moved = false
  return m
}
