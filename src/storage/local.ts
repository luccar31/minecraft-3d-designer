import type { DesignSummary } from '../types'
import type { DesignStore } from './types'
import { isStoredDesign } from './codec'

const KEY = (id: string) => `mcbp:design:${id}`
const INDEX = 'mcbp:index'

function readIndex(): DesignSummary[] {
  try {
    const raw = localStorage.getItem(INDEX)
    return raw ? (JSON.parse(raw) as DesignSummary[]) : []
  } catch {
    return []
  }
}

function writeIndex(list: DesignSummary[]) {
  localStorage.setItem(INDEX, JSON.stringify(list))
}

export const localStore: DesignStore = {
  mode: 'local',

  async list() {
    return readIndex().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  },

  async load(id) {
    const raw = localStorage.getItem(KEY(id))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return isStoredDesign(parsed) ? parsed : null
  },

  async save(design) {
    localStorage.setItem(KEY(design.id), JSON.stringify(design))
    const list = readIndex().filter((d) => d.id !== design.id)
    list.push({
      id: design.id,
      name: design.name,
      description: design.description,
      dims: design.dims,
      blockCount: design.blockCount,
      updatedAt: design.updatedAt,
    })
    writeIndex(list)
  },

  async remove(id) {
    localStorage.removeItem(KEY(id))
    writeIndex(readIndex().filter((d) => d.id !== id))
  },
}
