import type { DesignSummary, StoredDesign } from '../types'

export interface DesignStore {
  readonly mode: 'local' | 'cloud'
  list(): Promise<DesignSummary[]>
  load(id: string): Promise<StoredDesign | null>
  save(design: StoredDesign): Promise<void>
  remove(id: string): Promise<void>
}
