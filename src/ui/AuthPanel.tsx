import { useEffect, useState } from 'react'
import { getSupabase, setSignedIn, supabaseConfigured } from '../storage'
import { useEditor } from '../state/store'

/**
 * Magic-link login: lets a design saved on your computer show up on your
 * phone via the cloud.
 */
export function AuthPanel() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [user, setUser] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const sync = useEditor((s) => s.syncStorageMode)
  const refresh = useEditor((s) => s.refreshDesigns)

  useEffect(() => {
    const sb = getSupabase()
    if (!sb) return
    sb.auth.getUser().then(({ data }) => {
      setUser(data.user?.email ?? null)
      setSignedIn(Boolean(data.user))
      sync()
      refresh()
    })
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user?.email ?? null)
      setSignedIn(Boolean(session?.user))
      sync()
      refresh()
    })
    return () => sub.subscription.unsubscribe()
  }, [sync, refresh])

  if (!supabaseConfigured) {
    return (
      <div className="section">
        <h3>Nube</h3>
        <p className="hint">
          Sin configurar. Definí <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code>{' '}
          y aplicá la migración de <code>supabase/migrations/</code> para guardar en tu cuenta.
        </p>
      </div>
    )
  }

  if (user) {
    return (
      <div className="section">
        <h3>Nube</h3>
        <div className="row">
          <span className="label">Sesión: <b>{user}</b></span>
          <button
            className="ghost"
            onClick={async () => {
              await getSupabase()?.auth.signOut()
              setSignedIn(false)
              sync()
              refresh()
            }}
          >
            Salir
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="section">
      <h3>Nube</h3>
      {sent ? (
        <p className="hint">Te mandamos un link a <b>{email}</b>. Abrilo para iniciar sesión.</p>
      ) : (
        <div className="row">
          <input
            type="email"
            placeholder="tu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-label="Email"
          />
          <button
            onClick={async () => {
              setErr(null)
              const sb = getSupabase()
              if (!sb) return
              const { error } = await sb.auth.signInWithOtp({
                email,
                options: { emailRedirectTo: window.location.origin },
              })
              if (error) setErr(error.message)
              else setSent(true)
            }}
            disabled={!email.includes('@')}
          >
            Enviar link
          </button>
        </div>
      )}
      {err && <p className="err">{err}</p>}
    </div>
  )
}
