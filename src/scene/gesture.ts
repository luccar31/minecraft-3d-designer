export type Mode = 'build' | 'navigate'
export type Phase = 'idle' | 'pending' | 'painting' | 'navigating'

export type Cell = { x: number; y: number; z: number }
export type Mods = { shift: boolean; alt: boolean; ctrl: boolean; meta: boolean }

export type Input =
  | { kind: 'down'; pointerId: number; pointerType: string; button: number
      x: number; y: number; cell: Cell | null; mods: Mods }
  | { kind: 'move'; x: number; y: number; cell: Cell | null }
  | { kind: 'up'; x: number; y: number }
  | { kind: 'cancel' | 'lostCapture' | 'blur' | 'unmount' }

export type Output = {
  phase: Phase
  orbitEnabled: boolean
  capture?: number
  release?: number
  openStroke?: boolean
  closeStroke?: boolean
  commit?: Cell[]
  classified?: 'click' | 'drag' | 'camera'
  aborted?: 'cancel' | 'lostCapture' | 'blur' | 'unmount'
}

/** `dragTool` separates brush and eraser: only those paint while dragging. */
export type Ctx = { mode: Mode; dragTool: boolean }

export type GestureState = {
  phase: Phase
  pointerId: number | null
  pointerType: string
  startX: number
  startY: number
  candidate: Cell | null
  lastKey: string
}

export const initialState: GestureState = {
  phase: 'idle',
  pointerId: null,
  pointerType: 'mouse',
  startX: 0,
  startY: 0,
  candidate: null,
  lastKey: '',
}

const idle = (): GestureState => ({ ...initialState })

export const MOUSE_THRESHOLD_PX = 4
export const TOUCH_THRESHOLD_PX = 10

const thresholdFor = (pointerType: string) =>
  pointerType === 'touch' ? TOUCH_THRESHOLD_PX : MOUSE_THRESHOLD_PX

const keyOf = (c: Cell | null) => (c ? `${c.x},${c.y},${c.z}` : '')

export function step(
  state: GestureState,
  input: Input,
  ctx: Ctx,
): { state: GestureState; out: Output } {
  if (
    input.kind === 'cancel' || input.kind === 'lostCapture' ||
    input.kind === 'blur' || input.kind === 'unmount'
  ) {
    // Single exit path. There used to be four, and three left orbit dead.
    return {
      state: idle(),
      out: {
        phase: 'idle',
        orbitEnabled: true,
        release: state.pointerId ?? undefined,
        closeStroke: state.phase === 'painting' ? true : undefined,
        aborted: input.kind,
      },
    }
  }

  if (input.kind === 'down') {
    const toCamera =
      ctx.mode === 'navigate' || input.button !== 0 || input.cell === null
    if (toCamera) {
      return {
        state: { ...idle(), phase: 'navigating', pointerId: input.pointerId,
                 pointerType: input.pointerType, startX: input.x, startY: input.y },
        out: { phase: 'navigating', orbitEnabled: true },
      }
    }
    return {
      state: {
        phase: 'pending',
        pointerId: input.pointerId,
        pointerType: input.pointerType,
        startX: input.x,
        startY: input.y,
        candidate: input.cell,
        lastKey: '',
      },
      // Orbit stays off: OrbitControls listens on the canvas, outside R3F, so
      // stopPropagation cannot hold it and the camera drifts before classifying.
      out: { phase: 'pending', orbitEnabled: false, capture: input.pointerId },
    }
  }

  if (input.kind === 'move' && state.phase === 'pending') {
    const dx = input.x - state.startX
    const dy = input.y - state.startY
    if (Math.hypot(dx, dy) <= thresholdFor(state.pointerType)) {
      return { state, out: { phase: 'pending', orbitEnabled: false } }
    }
    if (!ctx.dragTool) {
      // Line, rect, fill, select and picker do not paint while dragging.
      return {
        state: { ...state, phase: 'navigating' },
        out: { phase: 'navigating', orbitEnabled: true, release: state.pointerId ?? undefined },
      }
    }
    const commit: Cell[] = []
    if (state.candidate) commit.push(state.candidate)
    if (input.cell && keyOf(input.cell) !== keyOf(state.candidate)) commit.push(input.cell)
    return {
      state: { ...state, phase: 'painting', lastKey: keyOf(input.cell ?? state.candidate) },
      out: {
        phase: 'painting', orbitEnabled: false, openStroke: true,
        classified: 'drag', commit,
      },
    }
  }

  if (input.kind === 'move' && state.phase === 'painting') {
    const key = keyOf(input.cell)
    if (!input.cell || key === state.lastKey) {
      return { state, out: { phase: 'painting', orbitEnabled: false } }
    }
    return {
      state: { ...state, lastKey: key },
      out: { phase: 'painting', orbitEnabled: false, commit: [input.cell] },
    }
  }

  if (input.kind === 'up' && state.phase === 'pending') {
    return {
      state: idle(),
      out: {
        phase: 'idle',
        orbitEnabled: true,
        release: state.pointerId ?? undefined,
        classified: 'click',
        commit: state.candidate ? [state.candidate] : [],
      },
    }
  }

  if (input.kind === 'up' && state.phase === 'painting') {
    return {
      state: idle(),
      out: {
        phase: 'idle', orbitEnabled: true, release: state.pointerId ?? undefined,
        closeStroke: true, classified: 'drag',
      },
    }
  }

  if (input.kind === 'up' && state.phase === 'navigating') {
    return {
      state: idle(),
      out: { phase: 'idle', orbitEnabled: true, classified: 'camera' },
    }
  }

  return {
    state,
    out: {
      phase: state.phase,
      orbitEnabled: state.phase !== 'painting' && state.phase !== 'pending',
    },
  }
}
