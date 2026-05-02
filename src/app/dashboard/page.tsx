import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DashboardClient from './DashboardClient'
import { fetchHQRanges, fetchNsRanges } from '@/lib/selection-ranges'

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  const { data: calculations } = await sb
    .from('calculations')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20)

  const { data: projects } = await sb
    .from('projects')
    .select('*')
    .order('updated_at', { ascending: false })

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
