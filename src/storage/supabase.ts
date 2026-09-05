import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { DesignSummary } from '../types'
import type { DesignStore } from './types'

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigured = Boolean(URL && ANON)

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient | null {
  if (!supabaseConfigured) return null
  if (!client) client = createClient(URL!, ANON!)
  return client
}

const TABLE = 'mc_designs'

type Row = {
  id: string
  name: string
  description: string
  size_x: number
  size_y: number
  size_z: number
  block_count: number
  payload: { palette: string[]; data: string }
  created_at: string
  updated_at: string
}

export const cloudStore: DesignStore = {
  mode: 'cloud',

  async list() {
    const sb = getSupabase()
    if (!sb) return []
    const { data, error } = await sb
      .from(TABLE)
      .select('id,name,description,size_x,size_y,size_z,block_count,updated_at')
      .order('updated_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map<DesignSummary>((r) => ({
      id: r.id,
      name: r.name,
      description: r.description ?? '',
      dims: { x: r.size_x, y: r.size_y, z: r.size_z },
      blockCount: r.block_count,
      updatedAt: r.updated_at,
    }))
  },

  async load(id) {
    const sb = getSupabase()
    if (!sb) return null
    const { data, error } = await sb.from(TABLE).select('*').eq('id', id).single()
    if (error) throw error
    const r = data as Row
    return {
      v: 1,
      id: r.id,
      name: r.name,
      description: r.description ?? '',
      dims: { x: r.size_x, y: r.size_y, z: r.size_z },
      palette: r.payload.palette,
      data: r.payload.data,
      blockCount: r.block_count,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }
  },

  async save(d) {
    const sb = getSupabase()
    if (!sb) throw new Error('Supabase no está configurado')
    const { data: session } = await sb.auth.getUser()
    if (!session.user) throw new Error('Sesión no iniciada')
    const { error } = await sb.from(TABLE).upsert({
      id: d.id,
      user_id: session.user.id,
      name: d.name,
      description: d.description,
      size_x: d.dims.x,
      size_y: d.dims.y,
      size_z: d.dims.z,
      block_count: d.blockCount,
      payload: { palette: d.palette, data: d.data },
      updated_at: d.updatedAt,
    })
    if (error) throw error
  },

  async remove(id) {
    const sb = getSupabase()
    if (!sb) return
    const { error } = await sb.from(TABLE).delete().eq('id', id)
    if (error) throw error
  },
}
