/** Identificador namespaced de Minecraft, ej. "minecraft:oak_planks". */
export type BlockId = string

/** Clave de voxel empaquetada: (x << 20) | (y << 10) | z. Cada eje 0..1023. */
export type VoxelKey = number

export type Dims = { x: number; y: number; z: number }
export type Vec3 = { x: number; y: number; z: number }

export type Axis = 'x' | 'y' | 'z'
export type Slice = { axis: Axis; index: number }

export type Tool =
  | 'brush'
  | 'eraser'
  | 'picker'
  | 'line'
  | 'rect'
  | 'fill'
  | 'select'

export type SliceView = 'off' | 'below' | 'isolate'

export type BoxSel = { min: Vec3; max: Vec3 }

/** Delta de una edición, para el historial. */
export type CellDelta = { key: VoxelKey; prev: BlockId | undefined; next: BlockId | undefined }

export type DesignMeta = {
  id: string
  name: string
  description: string
  dims: Dims
  createdAt: string
  updatedAt: string
}

/** Sobre serializado. Es a la vez el formato de nube y el de archivo .mcbp.json */
export type StoredDesign = {
  v: 1
  id: string
  name: string
  description: string
  dims: Dims
  palette: BlockId[]
  /** base64( gzip( registros de 6 bytes: uint32 key + uint16 paletteIndex ) ) */
  data: string
  blockCount: number
  createdAt: string
  updatedAt: string
}

export type DesignSummary = {
  id: string
  name: string
  description: string
  dims: Dims
  blockCount: number
  updatedAt: string
}

export const MAX_AXIS = 256
export const CHUNK = 16

export const packKey = (x: number, y: number, z: number): VoxelKey =>
  (x << 20) | (y << 10) | z

export const keyX = (k: VoxelKey) => (k >>> 20) & 1023
export const keyY = (k: VoxelKey) => (k >>> 10) & 1023
export const keyZ = (k: VoxelKey) => k & 1023
