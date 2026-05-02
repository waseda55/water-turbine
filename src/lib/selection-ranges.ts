import { createClient } from '@/lib/supabase/server'
import type { HQRange, NsRange } from '@/types'

export async function fetchHQRanges(): Promise<HQRange[]> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('hq_ranges')
    .select(`
      id, turbine_type_id, boundary_points,
      h_min, h_max, q_min, q_max,
      source, note, version,
      turbine_types ( id, name, icon, color, sort_order )
    `)
    .eq('is_active', true)
    .order('turbine_type_id')

  if (error || !data) return []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return data.map((r: any) => ({
    id:             r.id,
    turbineTypeId:  r.turbine_type_id,
    turbineType: {
      id:        r.turbine_types.id,
      name:      r.turbine_types.name,
      icon:      r.turbine_types.icon,
      color:     r.turbine_types.color,
      sortOrder: r.turbine_types.sort_order,
    },
    boundaryPoints: r.boundary_points as { q: number; h: number }[],
    hMin:    Number(r.h_min),
    hMax:    Number(r.h_max),
    qMin:    Number(r.q_min),
    qMax:    Number(r.q_max),
    source:  r.source,
    note:    r.note,
    version: r.version,
  }))
}

export async function fetchNsRanges(): Promise<NsRange[]> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('ns_ranges')
    .select(`
      id, turbine_type_id,
      ns_min, ns_max, overlap_note,
      source, note, version,
      turbine_types ( id, name, icon, color, sort_order )
    `)
    .eq('is_active', true)
    .order('turbine_type_id')

  if (error || !data) return []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return data.map((r: any) => ({
    id:             r.id,
    turbineTypeId:  r.turbine_type_id,
    turbineType: {
      id:        r.turbine_types.id,
      name:      r.turbine_types.name,
      icon:      r.turbine_types.icon,
      color:     r.turbine_types.color,
      sortOrder: r.turbine_types.sort_order,
    },
    nsMin:       Number(r.ns_min),
    nsMax:       Number(r.ns_max),
    overlapNote: r.overlap_note,
    source:      r.source,
    note:        r.note,
    version:     r.version,
  }))
}
