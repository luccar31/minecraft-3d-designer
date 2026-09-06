import { EV, rec, str } from '../debug'
import type { CellDelta } from '../types'
import type { World } from '../voxel/world'

const DEPTH = 100

/** Command stack of cell deltas; a full stroke is pushed as one entry. */
export class History {
  private past: CellDelta[][] = []
  private future: CellDelta[][] = []

  get canUndo() { return this.past.length > 0 }
  get canRedo() { return this.future.length > 0 }

  push(deltas: CellDelta[]) {
    if (deltas.length === 0) return
    const futureLost = this.future.length
    this.past.push(deltas)
    // Past the cap, the oldest entry can't be undone; this used to fail
    // silently, confusing users.
    const pruned = this.past.length > DEPTH
    if (pruned) this.past.shift()
    this.future.length = 0
    if (pruned || futureLost) rec(EV.historyPruned, pruned ? DEPTH : NaN, futureLost)
  }

  get depth() { return this.past.length }

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

  clear(reason = 'no-reason') {
    if (this.past.length || this.future.length) {
      rec(EV.historyCleared, this.past.length, this.future.length, str(reason))
    }
    this.past.length = 0
    this.future.length = 0
  }
}
