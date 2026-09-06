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
 * Rule: if Supabase is configured AND signed in, cloud is the only source
 * of truth; otherwise localStorage — never both.
 */
export function activeStore(): DesignStore {
  return supabaseConfigured && signedIn ? cloudStore : localStore
}

export { localStore, cloudStore }
