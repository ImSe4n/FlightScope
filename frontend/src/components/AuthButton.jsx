import { useState } from 'react'
import { useAppAuth } from '../context/AuthContext'

export default function AuthButton({ onOpenPanel }) {
  const { isAuthenticated, isLoading, user, login, logout, authError } = useAppAuth()
  const [open, setOpen] = useState(false)

  if (isLoading) {
    return <div className="auth-btn auth-btn--loading">●</div>
  }

  if (!isAuthenticated) {
    return (
      <div className="auth-signin-wrap">
        {authError && (
          <span className="auth-error-badge" title={authError.message}>
            ⚠ {authError.message?.replace(/\(.*?\)/g, '').trim() || 'Login error'}
          </span>
        )}
        <button className="auth-btn auth-btn--signin" onClick={() => login()}>
          Sign in
        </button>
      </div>
    )
  }

  return (
    <div className="auth-avatar-wrap">
      <button
        className="auth-avatar-btn"
        onClick={() => setOpen(o => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        title={user?.name || user?.email}
      >
        {user?.picture
          ? <img src={user.picture} className="auth-avatar-img" alt="" referrerPolicy="no-referrer" />
          : <span className="auth-avatar-initials">{(user?.name || user?.email || '?')[0].toUpperCase()}</span>
        }
      </button>
      {open && (
        <div className="auth-drop">
          <div className="auth-drop-user">
            <div className="auth-drop-name">{user?.name}</div>
            <div className="auth-drop-email">{user?.email}</div>
          </div>
          <div className="auth-drop-sep" />
          <button
            className="auth-drop-item"
            onMouseDown={() => { setOpen(false); onOpenPanel() }}
          >
            ★ Saved &amp; Settings
          </button>
          <div className="auth-drop-sep" />
          <button
            className="auth-drop-item auth-drop-item--danger"
            onMouseDown={() => { setOpen(false); logout() }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
