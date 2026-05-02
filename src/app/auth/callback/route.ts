import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Google OAuth コールバックエンドポイント
 * Supabase が ?code=xxx を付けてここにリダイレクトしてくる
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code  = searchParams.get('code')
  const next  = searchParams.get('next') ?? '/dashboard'
  const error = searchParams.get('error')

  // OAuth エラー（ユーザーがキャンセルした場合など）
  if (error) {
    return NextResponse.redirect(`${origin}/auth/login?error=${encodeURIComponent(error)}`)
  }

  if (code) {
    const supabase = createClient()
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
    if (!exchangeError) {
      // セッション確立成功 → ダッシュボードへ
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // 失敗時はログインページへ
  return NextResponse.redirect(`${origin}/auth/login?error=callback_failed`)
}
