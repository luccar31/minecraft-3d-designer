import { EV, rec, str } from '../debug'
import type { BlockId } from '../types'

export type Pattern =
  | 'solid' | 'stone' | 'cobble' | 'stoneBrick' | 'bricks' | 'planks'
  | 'logSide' | 'logTop' | 'leaves' | 'glass' | 'wool' | 'concrete'
  | 'grassTop' | 'grassSide' | 'dirt' | 'sand' | 'gravel' | 'metal'
  | 'crystal' | 'obsidian' | 'quartz' | 'terracotta' | 'snow' | 'moss'

export type TexSpec = {
  pattern: Pattern
  color: string
  accent?: string
}

export type Category = 'stone' | 'wood' | 'nature' | 'wool' | 'concrete' | 'decorative'

export type BlockDef = {
  id: BlockId
  name: string
  category: Category
  /** Representative color: UI, printed guide, layer minimap. */
  color: string
  /** Block doesn't occlude neighboring faces (glass, leaves). */
  transparent?: boolean
  tex: { top: TexSpec; side: TexSpec; bottom: TexSpec }
}

const uni = (t: TexSpec) => ({ top: t, side: t, bottom: t })
const col = (top: TexSpec, side: TexSpec, bottom: TexSpec) => ({ top, side, bottom })

export const CATEGORIES: { key: Category; label: string }[] = [
  { key: 'stone', label: 'Piedra' },
  { key: 'wood', label: 'Madera' },
  { key: 'nature', label: 'Naturaleza' },
  { key: 'wool', label: 'Lana' },
  { key: 'concrete', label: 'Concreto' },
  { key: 'decorative', label: 'Decorativo' },
]

const WOOL: [string, string, string][] = [
  ['white', 'Lana blanca', '#e9ecec'],
  ['light_gray', 'Lana gris claro', '#8e8e86'],
  ['gray', 'Lana gris', '#3e4447'],
  ['black', 'Lana negra', '#141519'],
  ['red', 'Lana roja', '#a12722'],
  ['orange', 'Lana naranja', '#f07613'],
  ['yellow', 'Lana amarilla', '#f8c627'],
  ['lime', 'Lana lima', '#70b219'],
  ['green', 'Lana verde', '#546d1b'],
  ['cyan', 'Lana cian', '#158991'],
  ['light_blue', 'Lana celeste', '#3aafd9'],
  ['blue', 'Lana azul', '#35399d'],
  ['purple', 'Lana violeta', '#8932b8'],
  ['magenta', 'Lana magenta', '#bd44b3'],
  ['pink', 'Lana rosa', '#ed8dac'],
  ['brown', 'Lana marrón', '#724728'],
]

const CONCRETE: [string, string, string][] = [
  ['white', 'Concreto blanco', '#cfd5d6'],
  ['light_gray', 'Concreto gris claro', '#7d7d73'],
  ['gray', 'Concreto gris', '#36393d'],
  ['black', 'Concreto negro', '#08090d'],
  ['red', 'Concreto rojo', '#8e2121'],
  ['orange', 'Concreto naranja', '#e06100'],
  ['yellow', 'Concreto amarillo', '#f1af15'],
  ['blue', 'Concreto azul', '#2c2e8f'],
]

export const BLOCKS: BlockDef[] = [
  // ── Stone ─────────────────────────────────────────────────────────────────
  { id: 'minecraft:stone', name: 'Piedra', category: 'stone', color: '#7d7d7d', tex: uni({ pattern: 'stone', color: '#7d7d7d' }) },
  { id: 'minecraft:cobblestone', name: 'Adoquín', category: 'stone', color: '#7a7a7a', tex: uni({ pattern: 'cobble', color: '#8b8b8b', accent: '#5a5a5a' }) },
  { id: 'minecraft:smooth_stone', name: 'Piedra lisa', category: 'stone', color: '#9d9d9d', tex: uni({ pattern: 'solid', color: '#9d9d9d' }) },
  { id: 'minecraft:stone_bricks', name: 'Ladrillo de piedra', category: 'stone', color: '#7a7a7a', tex: uni({ pattern: 'stoneBrick', color: '#7e7e7e', accent: '#5c5c5c' }) },
  { id: 'minecraft:mossy_stone_bricks', name: 'Ladrillo musgoso', category: 'stone', color: '#74796a', tex: uni({ pattern: 'stoneBrick', color: '#74806a', accent: '#4e5a44' }) },
  { id: 'minecraft:cracked_stone_bricks', name: 'Ladrillo agrietado', category: 'stone', color: '#6f6f6f', tex: uni({ pattern: 'stoneBrick', color: '#727272', accent: '#4a4a4a' }) },
  { id: 'minecraft:andesite', name: 'Andesita', category: 'stone', color: '#8a8a8d', tex: uni({ pattern: 'stone', color: '#8a8a8d' }) },
  { id: 'minecraft:polished_andesite', name: 'Andesita pulida', category: 'stone', color: '#a0a2a0', tex: uni({ pattern: 'solid', color: '#a0a2a0' }) },
  { id: 'minecraft:diorite', name: 'Diorita', category: 'stone', color: '#cfcfd2', tex: uni({ pattern: 'stone', color: '#cfcfd2' }) },
  { id: 'minecraft:granite', name: 'Granito', category: 'stone', color: '#9a6650', tex: uni({ pattern: 'stone', color: '#9a6650' }) },
  { id: 'minecraft:polished_granite', name: 'Granito pulido', category: 'stone', color: '#a3705a', tex: uni({ pattern: 'solid', color: '#a3705a' }) },
  { id: 'minecraft:deepslate', name: 'Pizarra profunda', category: 'stone', color: '#4f4f55', tex: uni({ pattern: 'logSide', color: '#4f4f55', accent: '#3c3c42' }) },
  { id: 'minecraft:deepslate_bricks', name: 'Ladrillo de pizarra', category: 'stone', color: '#3f3f45', tex: uni({ pattern: 'stoneBrick', color: '#484850', accent: '#2c2c32' }) },
  { id: 'minecraft:blackstone', name: 'Piedra negra', category: 'stone', color: '#2b2426', tex: uni({ pattern: 'stone', color: '#2b2426' }) },
  { id: 'minecraft:bricks', name: 'Ladrillos', category: 'stone', color: '#96574a', tex: uni({ pattern: 'bricks', color: '#a35b4c', accent: '#9c9c9c' }) },

  // ── Wood ──────────────────────────────────────────────────────────────────
  { id: 'minecraft:oak_planks', name: 'Tablas de roble', category: 'wood', color: '#b28758', tex: uni({ pattern: 'planks', color: '#b28758', accent: '#8a6640' }) },
  { id: 'minecraft:spruce_planks', name: 'Tablas de abeto', category: 'wood', color: '#6a4f31', tex: uni({ pattern: 'planks', color: '#6a4f31', accent: '#4d3a24' }) },
  { id: 'minecraft:birch_planks', name: 'Tablas de abedul', category: 'wood', color: '#d5c88e', tex: uni({ pattern: 'planks', color: '#d5c88e', accent: '#b0a06c' }) },
  { id: 'minecraft:jungle_planks', name: 'Tablas de jungla', category: 'wood', color: '#a97a55', tex: uni({ pattern: 'planks', color: '#a97a55', accent: '#835a3c' }) },
  { id: 'minecraft:acacia_planks', name: 'Tablas de acacia', category: 'wood', color: '#b05c33', tex: uni({ pattern: 'planks', color: '#b05c33', accent: '#8a4524' }) },
  { id: 'minecraft:dark_oak_planks', name: 'Tablas de roble oscuro', category: 'wood', color: '#4a3319', tex: uni({ pattern: 'planks', color: '#4a3319', accent: '#332210' }) },
  { id: 'minecraft:oak_log', name: 'Tronco de roble', category: 'wood', color: '#6b532f', tex: col({ pattern: 'logTop', color: '#b1904f', accent: '#8a6f3c' }, { pattern: 'logSide', color: '#6b532f', accent: '#4e3c22' }, { pattern: 'logTop', color: '#b1904f', accent: '#8a6f3c' }) },
  { id: 'minecraft:spruce_log', name: 'Tronco de abeto', category: 'wood', color: '#3b2a17', tex: col({ pattern: 'logTop', color: '#7a5f38', accent: '#5a4527' }, { pattern: 'logSide', color: '#3b2a17', accent: '#291d0f' }, { pattern: 'logTop', color: '#7a5f38', accent: '#5a4527' }) },
  { id: 'minecraft:birch_log', name: 'Tronco de abedul', category: 'wood', color: '#d8d5cc', tex: col({ pattern: 'logTop', color: '#d5c88e', accent: '#b0a06c' }, { pattern: 'logSide', color: '#d8d5cc', accent: '#4a4a48' }, { pattern: 'logTop', color: '#d5c88e', accent: '#b0a06c' }) },
  { id: 'minecraft:stripped_oak_log', name: 'Tronco pelado', category: 'wood', color: '#b3946c', tex: col({ pattern: 'logTop', color: '#b1904f', accent: '#8a6f3c' }, { pattern: 'planks', color: '#b3946c', accent: '#8f7452' }, { pattern: 'logTop', color: '#b1904f', accent: '#8a6f3c' }) },

  // ── Nature ────────────────────────────────────────────────────────────────
  { id: 'minecraft:dirt', name: 'Tierra', category: 'nature', color: '#866043', tex: uni({ pattern: 'dirt', color: '#866043' }) },
  { id: 'minecraft:grass_block', name: 'Bloque de pasto', category: 'nature', color: '#7cbd6b', tex: col({ pattern: 'grassTop', color: '#7cbd6b' }, { pattern: 'grassSide', color: '#866043', accent: '#7cbd6b' }, { pattern: 'dirt', color: '#866043' }) },
  { id: 'minecraft:moss_block', name: 'Bloque de musgo', category: 'nature', color: '#626e33', tex: uni({ pattern: 'moss', color: '#626e33' }) },
  { id: 'minecraft:sand', name: 'Arena', category: 'nature', color: '#dbd3a0', tex: uni({ pattern: 'sand', color: '#dbd3a0' }) },
  { id: 'minecraft:sandstone', name: 'Arenisca', category: 'nature', color: '#dbd0a0', tex: uni({ pattern: 'terracotta', color: '#dbd0a0', accent: '#c4b98c' }) },
  { id: 'minecraft:red_sand', name: 'Arena roja', category: 'nature', color: '#bf6b2e', tex: uni({ pattern: 'sand', color: '#bf6b2e' }) },
  { id: 'minecraft:gravel', name: 'Grava', category: 'nature', color: '#837f7e', tex: uni({ pattern: 'gravel', color: '#837f7e' }) },
  { id: 'minecraft:snow_block', name: 'Bloque de nieve', category: 'nature', color: '#f0fbfb', tex: uni({ pattern: 'snow', color: '#f0fbfb' }) },
  { id: 'minecraft:oak_leaves', name: 'Hojas de roble', category: 'nature', color: '#55a130', transparent: true, tex: uni({ pattern: 'leaves', color: '#55a130' }) },
  { id: 'minecraft:spruce_leaves', name: 'Hojas de abeto', category: 'nature', color: '#3e6b3e', transparent: true, tex: uni({ pattern: 'leaves', color: '#3e6b3e' }) },

  // ── Wool ──────────────────────────────────────────────────────────────────
  ...WOOL.map<BlockDef>(([slug, name, color]) => ({
    id: `minecraft:${slug}_wool`,
    name,
    category: 'wool',
    color,
    tex: uni({ pattern: 'wool', color }),
  })),

  // ── Concrete ──────────────────────────────────────────────────────────────
  ...CONCRETE.map<BlockDef>(([slug, name, color]) => ({
    id: `minecraft:${slug}_concrete`,
    name,
    category: 'concrete',
    color,
    tex: uni({ pattern: 'concrete', color }),
  })),

  // ── Decorative ────────────────────────────────────────────────────────────
  { id: 'minecraft:glass', name: 'Vidrio', category: 'decorative', color: '#c8e8f0', transparent: true, tex: uni({ pattern: 'glass', color: '#d6f0f7' }) },
  { id: 'minecraft:glowstone', name: 'Piedra luminosa', category: 'decorative', color: '#f9d49c', tex: uni({ pattern: 'crystal', color: '#f9d49c', accent: '#c9922f' }) },
  { id: 'minecraft:sea_lantern', name: 'Farol marino', category: 'decorative', color: '#b0d3cc', tex: uni({ pattern: 'crystal', color: '#b8ded6', accent: '#8ab5ad' }) },
  { id: 'minecraft:quartz_block', name: 'Bloque de cuarzo', category: 'decorative', color: '#ece6e0', tex: uni({ pattern: 'quartz', color: '#ece6e0' }) },
  { id: 'minecraft:gold_block', name: 'Bloque de oro', category: 'decorative', color: '#f9ec4e', tex: uni({ pattern: 'metal', color: '#f9ec4e', accent: '#c9b423' }) },
  { id: 'minecraft:iron_block', name: 'Bloque de hierro', category: 'decorative', color: '#d8d8d8', tex: uni({ pattern: 'metal', color: '#d8d8d8', accent: '#a8a8a8' }) },
  { id: 'minecraft:copper_block', name: 'Bloque de cobre', category: 'decorative', color: '#c16f52', tex: uni({ pattern: 'metal', color: '#c16f52', accent: '#94523c' }) },
  { id: 'minecraft:obsidian', name: 'Obsidiana', category: 'decorative', color: '#100d1a', tex: uni({ pattern: 'obsidian', color: '#100d1a', accent: '#5b3b8c' }) },
  { id: 'minecraft:terracotta', name: 'Terracota', category: 'decorative', color: '#96613f', tex: uni({ pattern: 'terracotta', color: '#96613f', accent: '#7d4f33' }) },
  { id: 'minecraft:white_terracotta', name: 'Terracota blanca', category: 'decorative', color: '#d1b1a1', tex: uni({ pattern: 'terracotta', color: '#d1b1a1', accent: '#b89383' }) },
  { id: 'minecraft:bookshelf', name: 'Biblioteca', category: 'decorative', color: '#6f5739', tex: col({ pattern: 'planks', color: '#b28758', accent: '#8a6640' }, { pattern: 'bricks', color: '#8a6a45', accent: '#c9a05f' }, { pattern: 'planks', color: '#b28758', accent: '#8a6640' }) },
]

export const BLOCK_BY_ID = new Map<BlockId, BlockDef>(BLOCKS.map((b) => [b.id, b]))

export const AIR = 'minecraft:air'

const warned = new Set<string>()

export function blockDef(id: BlockId): BlockDef {
  const b = BLOCK_BY_ID.get(id)
  if (b) return b
  // Unknown id renders magenta and still exports silently; warns once per
  // id (called per face).
  if (!warned.has(id)) {
    warned.add(id)
    rec(EV.unknownBlock, str(id))
  }
  return { id, name: id.replace('minecraft:', ''), category: 'stone', color: '#b455ff', tex: uni({ pattern: 'solid', color: '#b455ff' }) }
}

export function isTransparent(id: BlockId): boolean {
  return BLOCK_BY_ID.get(id)?.transparent === true
}

export const DEFAULT_BLOCK: BlockId = 'minecraft:oak_planks'
