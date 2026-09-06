/**
 * Did the camera move since the flag was last cleared? Transient camera fact,
 * not document state, so it stays out of the store. `Space` held while
 * orbiting must not read as a tap.
 */
let moved = false

export const markCameraMoved = () => {
  moved = true
}

export const consumeCameraMoved = (): boolean => {
  const m = moved
  moved = false
  return m
}
