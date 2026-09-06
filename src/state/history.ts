import { EV, rec, str } from '../debug'
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
    const futuroPerdido = this.future.length
    this.past.push(deltas)
    // Pasado el tope, la entrada más vieja deja de poder deshacerse. Antes esto
    // ocurría en silencio y el usuario sólo notaba que el undo "no llegaba".
    const podado = this.past.length > DEPTH
    if (podado) this.past.shift()
    this.future.length = 0
    if (podado || futuroPerdido) rec(EV.historialPodado, podado ? DEPTH : NaN, futuroPerdido)
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

  clear(motivo = 'sin-motivo') {
    if (this.past.length || this.future.length) {
      rec(EV.historialLimpiado, this.past.length, this.future.length, str(motivo))
    }
    this.past.length = 0
    this.future.length = 0
  }
}
