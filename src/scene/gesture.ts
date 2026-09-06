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

export function step(
  state: GestureState,
  input: Input,
  _ctx: Ctx,
): { state: GestureState; out: Output } {
  if (input.kind === 'down') {
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
      out: { phase: 'pending', orbitEnabled: true, capture: input.pointerId },
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

  return { state, out: { phase: state.phase, orbitEnabled: true } }
}
