import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DashboardClient from './DashboardClient'
import { fetchHQRanges, fetchNsRanges } from '@/lib/selection-ranges'

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // 直近20件の計算履歴を取得
  const { data: calculations } = await supabase
    .from('calculations')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20)

  // プロジェクト一覧
  const { data: projects } = await supabase
    .from('projects')
    .select('*')
    .order('updated_at', { ascending: false })

  // 選定図マスタデータ（DBから）
  const [hqRanges, nsRanges] = await Promise.all([
    fetchHQRanges(),
    fetchNsRanges(),
  ])

  return (
    <DashboardClient
      user={{ email: user.email ?? '' }}
      initialCalculations={calculations ?? []}
      initialProjects={projects ?? []}
      hqRanges={hqRanges}
      nsRanges={nsRanges}
    />
  )
}
