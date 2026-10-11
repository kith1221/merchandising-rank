'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await signIn('credentials', {
      email,
      password,
      redirect: false,
    })
    setLoading(false)
    if (res?.error) {
      setError('Email atau password salah')
      return
    }
    router.push('/')
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div className="feature-card glass-panel" style={{ width: '100%', maxWidth: '420px', padding: '40px' }}>
        <h2 style={{ marginBottom: '8px', fontSize: '24px' }}>Masuk ke Merchandising Rank</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '32px' }}>Login dengan akun yang sudah terdaftar</p>
        {error && <div className="alert error" style={{ marginBottom: '16px' }}>{error}</div>}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span>Email</span>
            <input type="email" className="input-field" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span>Password</span>
            <input type="password" className="input-field" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <button className="glow-btn" type="submit" disabled={loading} style={{ marginTop: '8px' }}>
            {loading ? 'Memproses...' : 'Masuk'}
          </button>
        </form>
      </div>
    </div>
  )
}
