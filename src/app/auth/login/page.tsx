'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

// Google ロゴ SVG（公式ブランドガイドライン準拠）
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  )
}

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  // メール/パスワード認証
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError(null); setMessage(null)

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) { setError(error.message); setLoading(false); return }
      router.push('/dashboard')
      router.refresh()
    } else {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) { setError(error.message); setLoading(false); return }
      setMessage('確認メールを送信しました。メールをご確認ください。')
      setLoading(false)
    }
  }

  // Google OAuth 認証
  const handleGoogleLogin = async () => {
    setGoogleLoading(true); setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${location.origin}/auth/callback`,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    })
    if (error) { setError(error.message); setGoogleLoading(false) }
    // エラーなければ Google のページにリダイレクトされるため setLoading 不要
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-gradient-to-br from-accent to-accent2 text-3xl mb-4">
            ⚙️
          </div>
          <h1 className="text-2xl font-bold text-accent tracking-wide">水車選定ツール</h1>
          <p className="text-muted text-sm mt-1">HPP Design 比較検証版</p>
        </div>

        {/* Card */}
        <div className="bg-surface border border-border rounded-xl p-8">

          {/* Google ログインボタン */}
          <button
            onClick={handleGoogleLogin}
            disabled={googleLoading}
            className="w-full flex items-center justify-center gap-3 py-2.5 bg-white hover:bg-gray-50 text-gray-700 rounded-lg text-sm font-semibold transition-colors disabled:opacity-60 mb-5 border border-gray-200"
          >
            <GoogleIcon />
            {googleLoading ? '処理中…' : 'Google アカウントでログイン'}
          </button>

          {/* 区切り線 */}
          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[11px] text-muted">または</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* メール/パスワード切替タブ */}
          <div className="flex gap-2 mb-5">
            {(['login', 'signup'] as const).map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(null); setMessage(null) }}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all
                  ${mode === m
                    ? 'bg-accent/15 border border-accent text-accent'
                    : 'bg-surface2 border border-border text-muted hover:text-text'}`}
              >
                {m === 'login' ? 'メールでログイン' : '新規登録'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-muted mb-1.5">メールアドレス</label>
              <input
                type="email" required value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-surface2 border border-border rounded-lg px-3 py-2.5 text-sm text-text outline-none focus:border-accent transition-colors"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1.5">パスワード</label>
              <input
                type="password" required value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-surface2 border border-border rounded-lg px-3 py-2.5 text-sm text-text outline-none focus:border-accent transition-colors"
                placeholder="••••••••"
              />
            </div>

            {error   && <p className="text-ng text-xs bg-ng/10 border border-ng/30 rounded-lg px-3 py-2">{error}</p>}
            {message && <p className="text-ok text-xs bg-ok/10 border border-ok/30 rounded-lg px-3 py-2">{message}</p>}

            <button
              type="submit" disabled={loading}
              className="w-full py-2.5 bg-accent/15 border border-accent text-accent rounded-lg text-sm font-semibold hover:bg-accent/25 transition-colors disabled:opacity-50"
            >
              {loading ? '処理中…' : mode === 'login' ? 'ログイン' : '登録する'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-muted mt-4">
          概略選定・比較検討用。詳細設計には製造者への確認が必要です。
        </p>
      </div>
    </div>
  )
}
