import { localStore } from './local'
import { cloudStore, getSupabase, supabaseConfigured } from './supabase'
import type { DesignStore } from './types'

export { supabaseConfigured, getSupabase }
export type { DesignStore }

let signedIn = false

export function setSignedIn(v: boolean) {
  signedIn = v
}

/**
 * Regla: si Supabase está configurado Y hay sesión, la nube es la única fuente
 * de verdad. En cualquier otro caso, localStorage. Nunca las dos a la vez.
 */
export function activeStore(): DesignStore {
  return supabaseConfigured && signedIn ? cloudStore : localStore
}

export { localStore, cloudStore }
