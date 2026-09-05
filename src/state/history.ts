import type { CellDelta } from '../types'
import type { World } from '../voxel/world'

const DEPTH = 100

/** Pila de comandos con deltas de celdas. Un trazo completo entra como una entrada. */
export class History {
  private past: CellDelta[][] = []
  private future: CellDelta[][] = []

  get canUndo() { return this.past.length > 0 }
  get canRedo() { return this.future.length > 0 }

  push(deltas: CellDelta[]) {
    if (deltas.length === 0) return
    this.past.push(deltas)
    if (this.past.length > DEPTH) this.past.shift()
    this.future.length = 0
  }

  undo(world: World): boolean {
    const d = this.past.pop()
    if (!d) return false
    world.applyDeltas(d, 'undo')
    this.future.push(d)
    return true
  }

  redo(world: World): boolean {
    const d = this.future.pop()
    if (!d) return false
    world.applyDeltas(d, 'redo')
    this.past.push(d)
    return true
  }

  clear() {
    this.past.length = 0
    this.future.length = 0
  }
}
