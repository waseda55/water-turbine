'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { calculate, getEfficiencyCurve } from '@/lib/turbine-calc'
import type { TurbineInputs, TurbineResults, HQRange, NsRange } from '@/types'
import { useRouter } from 'next/navigation'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'

// ─── 型 ────────────────────────────────────────────────────────
interface HistoryRow {
  id: string; name: string; turbine_type: string
  turbine_power: number; specific_speed: number; created_at: string
  head: number; flow_rate: number
}
interface ProjectRow { id: string; name: string }

interface Props {
  user: { email: string }
  initialCalculations: HistoryRow[]
  initialProjects: ProjectRow[]
  hqRanges: HQRange[]
  nsRanges: NsRange[]
}

// ─── 流量単位変換 ──────────────────────────────────────────────
type FlowUnit = 'm3/s' | 'l/s' | 'm3/min' | 'm3/h' | 'l/min' | 'l/h'

const FLOW_UNITS: { key: FlowUnit; label: string; toM3s: number; dec: number; max: number; step: number }[] = [
  { key: 'm3/s',   label: 'm³/s',   toM3s: 1,          dec: 3, max: 200,    step: 0.001 },
  { key: 'l/s',    label: 'l/s',    toM3s: 0.001,      dec: 1, max: 200000, step: 0.1   },
  { key: 'm3/min', label: 'm³/min', toM3s: 1/60,       dec: 2, max: 12000,  step: 0.01  },
  { key: 'm3/h',   label: 'm³/h',   toM3s: 1/3600,     dec: 1, max: 720000, step: 0.1   },
  { key: 'l/min',  label: 'l/min',  toM3s: 1/60000,    dec: 0, max: 12e6,   step: 1     },
  { key: 'l/h',    label: 'l/h',    toM3s: 1/3600000,  dec: 0, max: 720e6,  step: 1     },
]

/** m³/s → 指定単位に変換 */
function toDisplayFlow(m3s: number, unit: FlowUnit): number {
  const u = FLOW_UNITS.find(u => u.key === unit)!
  return m3s / u.toM3s
}

/** 指定単位 → m³/s に変換 */
function toM3s(val: number, unit: FlowUnit): number {
  const u = FLOW_UNITS.find(u => u.key === unit)!
  return val * u.toM3s
}
const DEFAULT_INPUTS: TurbineInputs = {
  head: 50, flowRate: 5, turbineEff: 88, generatorEff: 96,
  suctionHead: 2, altitude: 0, frequency: 50,
  powerFactor: 0.85,
  operatingHours: 8000,
  capacityFactor: 70,
  penstock: { length: 500, material: 'steel' },
}

// ─── 判定バッジ ────────────────────────────────────────────────
function Badge({ result }: { result: string }) {
  const styles: Record<string, string> = {
    OK:   'bg-ok/20 text-ok border-ok/30',
    NG:   'bg-ng/20 text-ng border-ng/30',
    '注意': 'bg-warn/20 text-warn border-warn/30',
    'N/A': 'bg-accent/15 text-accent border-accent/30',
    INFO: 'bg-accent/15 text-accent border-accent/30',
  }
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono border whitespace-nowrap flex-shrink-0 ${styles[result] ?? styles.INFO}`}>
      {result}
    </span>
  )
}

// ══════════════════════════════════════════════════════════════
// H-Q 選定図（SVG・対数スケール）
// ══════════════════════════════════════════════════════════════
function HQChart({ head, flowRate, turbineType, hqRanges, flowUnit }: {
  head: number; flowRate: number; turbineType: string; hqRanges: HQRange[]; flowUnit: FlowUnit
}) {
  const W = 560, H = 380
  const pad = { top: 20, right: 30, bottom: 50, left: 60 }
  const cw = W - pad.left - pad.right
  const ch = H - pad.top - pad.bottom

  const Q_MIN = 0.05, Q_MAX = 600
  const H_MIN = 2,    H_MAX = 1200
  const toX = (q: number) => pad.left + Math.log10(q / Q_MIN) / Math.log10(Q_MAX / Q_MIN) * cw
  const toY = (h: number) => pad.top + ch - Math.log10(h / H_MIN) / Math.log10(H_MAX / H_MIN) * ch

  const qTicks = [0.05, 0.1, 0.5, 1, 5, 10, 50, 100, 500]
  const hTicks = [2, 5, 10, 20, 50, 100, 200, 500, 1000]

  const ptStr = (pts: { q: number; h: number }[]) =>
    pts.map(p => `${toX(p.q).toFixed(1)},${toY(p.h).toFixed(1)}`).join(' ')

  const cx = toX(flowRate)
  const cy = toY(head)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 380 }}>
      <rect x={pad.left} y={pad.top} width={cw} height={ch} fill="var(--bg)" rx="4" />
      {qTicks.map(q => (
        <line key={q} x1={toX(q)} y1={pad.top} x2={toX(q)} y2={pad.top+ch} stroke="var(--border)" strokeWidth="1" />
      ))}
      {hTicks.map(h => (
        <line key={h} x1={pad.left} y1={toY(h)} x2={pad.left+cw} y2={toY(h)} stroke="var(--border)" strokeWidth="1" />
      ))}
      {hqRanges.map(r => (
        <polygon key={r.id} points={ptStr(r.boundaryPoints)}
          fill={r.turbineType.color} fillOpacity="0.12"
          stroke={turbineType === r.turbineType.name ? r.turbineType.color : r.turbineType.color + '66'}
          strokeWidth={turbineType === r.turbineType.name ? 2 : 1}
          strokeDasharray={turbineType === r.turbineType.name ? '' : '4 3'}
        />
      ))}
      {hqRanges.map(r => {
        const firstPt = r.boundaryPoints[0]
        return (
          <text key={r.id}
            x={toX(firstPt.q * 1.3)} y={toY(firstPt.h * 1.8)}
            fill={r.turbineType.color} fontSize="11" fontWeight="bold">
            {r.turbineType.name.replace('水車', '')}
          </text>
        )
      })}
      {flowRate >= Q_MIN && flowRate <= Q_MAX && head >= H_MIN && head <= H_MAX && (
        <g>
          <circle cx={cx} cy={cy} r="10" fill="none" stroke="var(--accent)" strokeWidth="1.5" opacity="0.4" />
          <circle cx={cx} cy={cy} r="5"  fill="var(--accent)" stroke="#0a0e1a" strokeWidth="1.5" />
          <text x={cx+10} y={cy-8} fill="var(--accent)" fontSize="11" fontWeight="bold">Q={toDisplayFlow(flowRate,flowUnit).toFixed(FLOW_UNITS.find(u=>u.key===flowUnit)!.dec)} {FLOW_UNITS.find(u=>u.key===flowUnit)!.label}</text>
          <text x={cx+10} y={cy+4} fill="var(--accent)" fontSize="11">H={head} m</text>
        </g>
      )}
      {qTicks.map(q => (
        <text key={q} x={toX(q)} y={pad.top+ch+16} textAnchor="middle" fill="var(--muted)" fontSize="10">{q}</text>
      ))}
      <text x={pad.left+cw/2} y={H-4} textAnchor="middle" fill="var(--muted)" fontSize="11">設計流量 Q [{FLOW_UNITS.find(u=>u.key===flowUnit)!.label}]　※軸はm³/s基準</text>
      {hTicks.map(h => (
        <text key={h} x={pad.left-8} y={toY(h)+4} textAnchor="end" fill="var(--muted)" fontSize="10">{h}</text>
      ))}
      <text x={14} y={pad.top+ch/2} textAnchor="middle" fill="var(--muted)" fontSize="11"
        transform={`rotate(-90, 14, ${pad.top+ch/2})`}>有効落差 H [m]</text>
      <rect x={pad.left} y={pad.top} width={cw} height={ch} fill="none" stroke="var(--border)" strokeWidth="1" rx="4" />
    </svg>
  )
}

// ══════════════════════════════════════════════════════════════
// Ns 分布図（SVG・横バー）
// ══════════════════════════════════════════════════════════════
function NsChart({ ns, turbineType, nsRanges }: {
  ns: number; turbineType: string; nsRanges: NsRange[]
}) {
  const W = 560, H = 220
  const pad = { top: 24, right: 40, bottom: 40, left: 20 }
  const cw = W - pad.left - pad.right
  const ch = H - pad.top - pad.bottom

  const NS_MAX = 1000
  const toX = (n: number) => pad.left + (n / NS_MAX) * cw
  const rowH = 36
  const nsTicks = [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]
  const nsX = toX(Math.min(Math.max(ns, 0), NS_MAX))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 220 }}>
      <rect x={pad.left} y={pad.top} width={cw} height={ch} fill="var(--bg)" rx="4" />
      {nsTicks.map(t => (
        <line key={t} x1={toX(t)} y1={pad.top} x2={toX(t)} y2={pad.top+ch} stroke="var(--border)" strokeWidth="1" />
      ))}
      {nsRanges.map((r, i) => {
        const active = turbineType === r.turbineType.name
        const x1 = toX(r.nsMin), x2 = toX(r.nsMax)
        const barY = pad.top + i * rowH + 8
        return (
          <g key={r.id}>
            <rect x={pad.left} y={barY} width={cw} height={rowH - 4} fill={r.turbineType.color} fillOpacity="0.04" />
            <rect x={x1} y={barY + 6} width={x2 - x1} height={rowH - 16}
              fill={r.turbineType.color} fillOpacity={active ? 0.35 : 0.15}
              stroke={r.turbineType.color} strokeWidth={active ? 2 : 1} rx="3" />
            <text x={pad.left + 6} y={barY + rowH/2 - 1}
              fill={active ? r.turbineType.color : '#7a90a8'} fontSize="11"
              fontWeight={active ? 'bold' : 'normal'} dominantBaseline="middle">
              {r.turbineType.name}
            </text>
            <text x={x2 + 6} y={barY + rowH/2 - 1}
              fill={r.turbineType.color} fontSize="10" dominantBaseline="middle" opacity={active ? 1 : 0.6}>
              {r.nsMin}〜{r.nsMax}
            </text>
          </g>
        )
      })}
      <line x1={nsX} y1={pad.top} x2={nsX} y2={pad.top+ch} stroke="var(--accent)" strokeWidth="2" strokeDasharray="4 2" />
      <circle cx={nsX} cy={pad.top} r="4" fill="var(--accent)" />
      <rect x={nsX - 28} y={pad.top - 18} width={56} height={16} rx="3" fill="var(--bg)" stroke="var(--accent)" strokeWidth="1" />
      <text x={nsX} y={pad.top - 7} textAnchor="middle" fill="var(--accent)" fontSize="10" fontWeight="bold">
        Ns={ns.toFixed(1)}
      </text>
      {nsTicks.map(t => (
        <text key={t} x={toX(t)} y={pad.top+ch+14} textAnchor="middle" fill="var(--muted)" fontSize="10">{t}</text>
      ))}
      <text x={pad.left+cw/2} y={H-2} textAnchor="middle" fill="var(--muted)" fontSize="11">比速度 Ns</text>
      <rect x={pad.left} y={pad.top} width={cw} height={ch} fill="none" stroke="var(--border)" strokeWidth="1" rx="4" />
    </svg>
  )
}

function SliderInput({
  label, id, value, min, max, step, unit, dec = 1,
  onChange,
}: {
  label: string; id: string; value: number
  min: number; max: number; step: number; unit: string; dec?: number
  onChange: (v: number) => void
}) {
  const [raw, setRaw] = useState(String(value))

  const commit = (v: number) => {
    const clamped = Math.min(max, Math.max(min, v))
    setRaw(clamped.toFixed(dec))
    onChange(clamped)
  }

  return (
    <div className="mb-4">
      <div className="flex justify-between items-baseline mb-1.5">
        <span className="text-xs text-muted font-medium">{label}</span>
        <span className="text-[10px] text-muted">{unit}　{min}〜{max}</span>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={e => { const v = parseFloat(e.target.value); setRaw(v.toFixed(dec)); onChange(v) }}
          className="flex-1"
        />
        <input
          type="number" min={min} max={max} step={step} value={raw}
          onChange={e => setRaw(e.target.value)}
          onBlur={() => commit(parseFloat(raw))}
          onKeyDown={e => e.key === 'Enter' && commit(parseFloat(raw))}
          className="w-[72px] flex-shrink-0 bg-surface2 border border-border rounded-md px-2 py-1 text-right text-[13px] font-mono text-accent font-bold outline-none focus:border-accent transition-colors"
        />
      </div>
      <div className="flex justify-between mt-0.5 pr-[80px]">
        <span className="text-[10px] text-muted">{min} {unit}</span>
        <span className="text-[10px] text-muted">{max} {unit}</span>
      </div>
    </div>
  )
}

// ─── メインコンポーネント ─────────────────────────────────────
export default function DashboardClient({ user, initialCalculations, initialProjects, hqRanges, nsRanges }: Props) {
  const [inputs, setInputs] = useState<TurbineInputs>(DEFAULT_INPUTS)
  const [results, setResults] = useState<TurbineResults>(() => calculate(DEFAULT_INPUTS))
  const [history, setHistory] = useState<HistoryRow[]>(initialCalculations)
  const [projects] = useState<ProjectRow[]>(initialProjects)
  const [saving, setSaving] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [sidebarTab, setSidebarTab] = useState<'history' | 'projects'>('history')
  const [mainTab, setMainTab] = useState<'result' | 'hq' | 'ns'>('result')
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [flowUnit, setFlowUnit] = useState<FlowUnit>('m3/s')
  const router = useRouter()
  const supabase = createClient()

  const update = useCallback((patch: Partial<TurbineInputs>) => {
    setInputs(prev => {
      const next = { ...prev, ...patch }
      setResults(calculate(next))
      return next
    })
  }, [])

  const set = (key: keyof TurbineInputs) => (v: number) => update({ [key]: v })

  // タイプ色
  const typeColor = results.turbineType === 'ペルトン水車' ? '#a78bfa'
    : results.turbineType === 'フランシス水車' ? '#38bdf8' : '#34d399'

  // 効率曲線
  const effData = getEfficiencyCurve(results.turbineType, inputs.turbineEff / 100)

  // 保存
  const handleSave = async () => {
    if (!saveName.trim()) return
    setSaving(true)
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) { setSaving(false); return }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).from('calculations').insert({
      user_id:         authUser.id,
      project_id:      selectedProjectId || null,
      name:            saveName,
      head:            inputs.head,
      flow_rate:       inputs.flowRate,
      turbine_eff:     inputs.turbineEff,
      generator_eff:   inputs.generatorEff,
      suction_head:    inputs.suctionHead,
      altitude:        inputs.altitude,
      frequency:       inputs.frequency,
      turbine_type:    results.turbineType,
      turbine_power:   results.turbinePower,
      generator_power: results.generatorPower,
      specific_speed:  results.specificSpeed,
      rated_rpm:       results.ratedRpm,
      poles:           results.poles,
      runaway_speed:   results.runawaySpeed,
      cavitation_coef: results.cavitationCoef,
      hs_max:          results.hsMax,
      atm_pressure:    results.atmPressure,
      check_cavitation:results.checks.cavitation.result,
      check_ns:        results.checks.specificSpeed.result,
      check_altitude:  results.checks.altitude.result,
    }).select().single()

    if (!error && data) {
      setHistory(prev => [data as unknown as HistoryRow, ...prev.slice(0, 19)])
      setShowSaveModal(false)
      setSaveName('')
    }
    setSaving(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  // 履歴から復元
  const loadHistory = async (id: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any).from('calculations').select('*').eq('id', id).single()
    if (!data) return
    const restored: TurbineInputs = {
      head: data.head, flowRate: data.flow_rate,
      turbineEff: data.turbine_eff, generatorEff: data.generator_eff,
      suctionHead: data.suction_head, altitude: data.altitude,
      frequency: data.frequency as 50 | 60,
      powerFactor: data.power_factor ?? 0.85,
      operatingHours: data.operating_hours ?? 8000,
      capacityFactor: data.capacity_factor ?? 70,
      penstock: { length: data.penstock_length ?? 500, material: data.penstock_material ?? 'steel' },
    }
    setInputs(restored)
    setResults(calculate(restored))
  }

  return (
    <div className={`min-h-screen flex flex-col bg-bg ${theme}`}>
      {/* ─── Header ─── */}
      <header className="sticky top-0 z-50 bg-bg/90 backdrop-blur border-b border-border px-6 py-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-accent to-accent2 flex items-center justify-center text-xl">⚙️</div>
        <div>
          <h1 className="text-base font-bold text-accent tracking-wide leading-none">水車選定ツール</h1>
          <p className="text-[10px] text-muted mt-0.5">HPP Design 比較検証版 — 2026.05</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-muted hidden sm:block">{user.email}</span>
          {/* テーマトグル */}
          <button
            onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
            title={theme === 'dark' ? 'ライトモードに切替' : 'ダークモードに切替'}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-border bg-surface2 hover:border-accent transition-colors text-base"
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button
            onClick={() => setShowSaveModal(true)}
            className="px-3 py-1.5 bg-accent/15 border border-accent text-accent text-xs font-semibold rounded-lg hover:bg-accent/25 transition-colors"
          >
            💾 保存
          </button>
          <button
            onClick={handleLogout}
            className="px-3 py-1.5 bg-surface2 border border-border text-muted text-xs rounded-lg hover:text-text transition-colors"
          >
            ログアウト
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ─── LEFT: Inputs ─── */}
        <aside className="w-[340px] flex-shrink-0 bg-surface border-r border-border overflow-y-auto p-5">
          <p className="text-[10px] font-bold tracking-[0.15em] text-muted uppercase border-b border-border pb-2 mb-4">基本パラメータ</p>
          <SliderInput label="有効落差（H）"    id="H"     value={inputs.head}         min={2}   max={1000} step={1}   unit="m"    dec={0} onChange={set('head')} />

          {/* 設計流量：単位セレクタ付き */}
          {(() => {
            const u = FLOW_UNITS.find(u => u.key === flowUnit)!
            const displayVal = toDisplayFlow(inputs.flowRate, flowUnit)
            return (
              <div className="mb-4">
                <div className="flex justify-between items-baseline mb-1.5">
                  <span className="text-xs text-muted font-medium">設計流量（Q）</span>
                  <select
                    value={flowUnit}
                    onChange={e => setFlowUnit(e.target.value as FlowUnit)}
                    className="text-[11px] bg-surface2 border border-border rounded px-1.5 py-0.5 text-accent font-mono outline-none focus:border-accent cursor-pointer"
                  >
                    {FLOW_UNITS.map(u => (
                      <option key={u.key} value={u.key}>{u.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="range" min={0} max={u.max} step={u.step}
                    value={displayVal}
                    onChange={e => {
                      const v = toM3s(parseFloat(e.target.value), flowUnit)
                      update({ flowRate: Math.max(0.0001, v) })
                    }}
                    className="flex-1"
                  />
                  <input
                    type="number" min={0} max={u.max} step={u.step}
                    value={parseFloat(displayVal.toFixed(u.dec))}
                    onChange={e => {
                      const v = toM3s(parseFloat(e.target.value), flowUnit)
                      if (!isNaN(v) && v > 0) update({ flowRate: v })
                    }}
                    className="w-[80px] flex-shrink-0 bg-surface2 border border-border rounded-md px-2 py-1 text-right text-[13px] font-mono text-accent font-bold outline-none focus:border-accent transition-colors"
                  />
                </div>
                <div className="flex justify-between mt-0.5 pr-[88px]">
                  <span className="text-[10px] text-muted">0 {u.label}</span>
                  <span className="text-[10px] text-muted">{u.max.toLocaleString()} {u.label}</span>
                </div>
                <div className="text-[10px] text-muted mt-1 text-right">
                  = {inputs.flowRate.toFixed(4)} m³/s
                </div>
              </div>
            )
          })()}
          <SliderInput label="水車効率（η_t）"  id="eta_t" value={inputs.turbineEff}    min={70}  max={95}   step={0.1} unit="%"    dec={1} onChange={set('turbineEff')} />
          <SliderInput label="発電機効率（η_g）"id="eta_g" value={inputs.generatorEff}  min={90}  max={99}   step={0.1} unit="%"    dec={1} onChange={set('generatorEff')} />

          <p className="text-[10px] font-bold tracking-[0.15em] text-muted uppercase border-b border-border pb-2 mb-4 mt-6">設置条件</p>
          <SliderInput label="吸出し高さ（Hs）" id="Hs"  value={inputs.suctionHead} min={-5} max={15}   step={0.1} unit="m" dec={1} onChange={set('suctionHead')} />
          <SliderInput label="設置標高"          id="alt" value={inputs.altitude}    min={0}  max={3000} step={10}  unit="m" dec={0} onChange={set('altitude')} />

          <div className="mb-4">
            <p className="text-xs text-muted mb-1.5">電源周波数（f）</p>
            <div className="flex gap-2">
              {([50, 60] as const).map(f => (
                <button key={f}
                  onClick={() => update({ frequency: f })}
                  className={`flex-1 py-2 rounded-lg text-sm border transition-all font-medium
                    ${inputs.frequency === f
                      ? 'bg-accent/15 border-accent text-accent font-bold'
                      : 'bg-surface2 border-border text-muted hover:text-text'}`}
                >
                  {f} Hz {f === 50 ? '（東日本）' : '（西日本）'}
                </button>
              ))}
            </div>
          </div>

          <p className="text-[10px] font-bold tracking-[0.15em] text-muted uppercase border-b border-border pb-2 mb-4 mt-4">電気系パラメータ</p>
          <SliderInput label="力率（cos φ）"  id="pf" value={inputs.powerFactor}    min={0.70} max={1.00} step={0.01} unit=""     dec={2} onChange={v => update({ powerFactor: v })} />
          <SliderInput label="年間稼働時間"    id="oh" value={inputs.operatingHours} min={1000} max={8760} step={100}  unit="h/年" dec={0} onChange={v => update({ operatingHours: v })} />
          <SliderInput label="設備利用率"      id="cf" value={inputs.capacityFactor} min={10}   max={100}  step={1}    unit="%"    dec={0} onChange={v => update({ capacityFactor: v })} />

          <p className="text-[10px] font-bold tracking-[0.15em] text-muted uppercase border-b border-border pb-2 mb-4 mt-4">導水管パラメータ</p>
          <SliderInput label="導水管延長" id="pl" value={inputs.penstock.length} min={10} max={5000} step={10} unit="m" dec={0} onChange={v => update({ penstock: { ...inputs.penstock, length: v } })} />
          <div className="mb-4">
            <p className="text-xs text-muted mb-1.5">管種</p>
            <div className="flex gap-1.5">
              {([
                { key: 'steel',   label: '鋼管' },
                { key: 'ductile', label: 'ダクタイル' },
                { key: 'frp',     label: 'FRP' },
              ] as const).map(m => (
                <button key={m.key}
                  onClick={() => update({ penstock: { ...inputs.penstock, material: m.key } })}
                  className={`flex-1 py-1.5 rounded-lg text-xs border transition-all
                    ${inputs.penstock.material === m.key
                      ? 'bg-accent/15 border-accent text-accent font-bold'
                      : 'bg-surface2 border-border text-muted hover:text-text'}`}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 p-3 rounded-lg bg-accent2/8 border border-accent2/25 text-[11px] text-muted leading-relaxed">
            <span className="text-accent2 font-semibold">HPP Design（45 Engineering, Italy）比較版</span><br/>
            主要静的項目は±3%以内で一致。動的項目の差はCFD相当の詳細計算によるものです。<br/>
            概略選定・比較検討用。詳細設計には製造者への確認が必要です。
          </div>
        </aside>

        {/* ─── CENTER: Results ─── */}
        <main className="flex-1 overflow-y-auto min-w-0 flex flex-col">

          {/* タブバー */}
          <div className="flex border-b border-border bg-surface px-5 pt-4 gap-1 flex-shrink-0">
            {([
              { id: 'result', label: '📊 計算結果' },
              { id: 'hq',     label: '📈 H-Q 選定図' },
              { id: 'ns',     label: '⚡ Ns 分布図' },
            ] as const).map(tab => (
              <button key={tab.id} onClick={() => setMainTab(tab.id)}
                className={`px-4 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition-all
                  ${mainTab === tab.id
                    ? 'text-accent border-accent bg-accent/5'
                    : 'text-muted border-transparent hover:text-text'}`}>
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-5">

          {/* ══ TAB: 計算結果 ══ */}
          {mainTab === 'result' && (<>
          {/* Turbine card */}
          <div className="bg-surface border border-border rounded-xl p-5 mb-4 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: typeColor }} />
            <div className="flex items-center gap-4 mb-5">
              <div className="w-14 h-14 rounded-xl bg-surface2 border border-border flex items-center justify-center text-3xl">
                {results.turbineType === 'ペルトン水車' ? '💧' : results.turbineType === 'フランシス水車' ? '🌊' : '🌀'}
              </div>
              <div>
                <div className="text-xl font-bold" style={{ color: typeColor }}>{results.turbineType}</div>
                <div className="text-xs text-muted mt-0.5">
                  H={inputs.head}m　Q={toDisplayFlow(inputs.flowRate, flowUnit).toFixed(FLOW_UNITS.find(u=>u.key===flowUnit)!.dec)} {FLOW_UNITS.find(u=>u.key===flowUnit)!.label}　f={inputs.frequency}Hz　Ns={results.specificSpeed.toFixed(1)}
                </div>
              </div>
            </div>

            {/* KPI grid */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { label: '水車出力 Pw', val: results.turbinePower.toFixed(1),   unit: 'kW' },
                { label: '発電機出力',  val: results.generatorPower.toFixed(1), unit: 'kW' },
                { label: '比速度 Ns',   val: results.specificSpeed.toFixed(1),  unit: 'm·kW' },
                { label: '定格回転速度',val: Math.round(results.ratedRpm),       unit: 'rpm' },
                { label: '極数',        val: results.poles,                      unit: 'P' },
                { label: '暴走速度',    val: Math.round(results.runawaySpeed),   unit: 'rpm' },
              ].map(k => (
                <div key={k.label} className="bg-surface2 border border-border rounded-lg p-3 text-center">
                  <div className="text-xl font-bold font-mono text-accent leading-none mb-1">{k.val}</div>
                  <div className="text-[10px] text-muted leading-tight">{k.label}<br/><span className="text-[9px]">{k.unit}</span></div>
                </div>
              ))}
            </div>

            {/* Checks */}
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { label: 'キャビテーション', ...results.checks.cavitation },
                { label: '比速度の妥当性',   ...results.checks.specificSpeed },
                { label: '標高・大気圧低下', ...results.checks.altitude },
                { label: '暴走速度',         result: 'INFO', message: results.checks.runaway.message },
              ].map(c => (
                <div key={c.label} className="bg-surface2 border border-border rounded-lg p-3 flex items-start gap-2">
                  <Badge result={c.result} />
                  <div>
                    <div className="text-xs font-medium mb-0.5">{c.label}</div>
                    <div className="text-[10px] text-muted leading-tight">{c.message}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── 追加判定（管路損失・水撃圧） ── */}
          <div className="grid grid-cols-2 gap-2.5 mt-3">
            {[
              { label: '管路損失', ...results.checks.headLoss },
              { label: '水撃圧',   ...results.checks.waterHammer },
            ].map(c => (
              <div key={c.label} className="bg-surface2 border border-border rounded-lg p-3 flex items-start gap-2">
                <Badge result={c.result} />
                <div>
                  <div className="text-xs font-medium mb-0.5">{c.label}</div>
                  <div className="text-[10px] text-muted leading-tight">{c.message}</div>
                </div>
              </div>
            ))}
          </div>

          {/* ── 寸法・水理・電気系 3カラム ── */}
          <div className="grid grid-cols-3 gap-3 mt-3">
            {/* 寸法系 */}
            <div className="bg-surface border border-border rounded-xl p-4">
              <p className="text-[10px] font-bold tracking-[0.12em] text-muted uppercase mb-3">📐 寸法系</p>
              <table className="w-full text-xs">
                <tbody>
                  {[
                    ['ランナー径 D',    `${results.dimensions.runnerDiameter.toFixed(3)} m`],
                    ['吸出し管径',      results.dimensions.draftTubeDiameter != null ? `${results.dimensions.draftTubeDiameter.toFixed(3)} m` : '—（衝動式）'],
                    ['ケーシング概略径',results.dimensions.casingDiameter != null ? `${results.dimensions.casingDiameter.toFixed(3)} m` : '—'],
                    ['導水管径',        `${results.dimensions.penstockDiameter.toFixed(3)} m`],
                    ['導水管流速',      `${results.dimensions.penstockVelocity.toFixed(1)} m/s`],
                  ].map(([label, val], i) => (
                    <tr key={label} className={i % 2 === 0 ? 'bg-accent/[0.03]' : ''}>
                      <td className="py-1 pr-1 text-muted text-[10px] leading-tight">{label}</td>
                      <td className="py-1 font-mono text-accent font-semibold text-[11px] text-right">{val}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 水理・構造系 */}
            <div className="bg-surface border border-border rounded-xl p-4">
              <p className="text-[10px] font-bold tracking-[0.12em] text-muted uppercase mb-3">💧 水理・構造系</p>
              <table className="w-full text-xs">
                <tbody>
                  {[
                    ['GD²',             `${results.hydraulics.gd2.toFixed(2)} kN·m²`],
                    ['水撃圧 ΔH',       `${results.hydraulics.waterHammerHead.toFixed(1)} m`],
                    ['水撃圧上昇率',    `+${results.hydraulics.waterHammerRise.toFixed(1)} %`],
                    ['管路損失 hf',     `${results.hydraulics.penstock.headLoss.toFixed(2)} m`],
                    ['管路損失率',      `${results.hydraulics.penstock.headLossRatio.toFixed(1)} %`],
                  ].map(([label, val], i) => (
                    <tr key={label} className={i % 2 === 0 ? 'bg-accent/[0.03]' : ''}>
                      <td className="py-1 pr-1 text-muted text-[10px] leading-tight">{label}</td>
                      <td className="py-1 font-mono text-accent font-semibold text-[11px] text-right">{val}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 電気系 */}
            <div className="bg-surface border border-border rounded-xl p-4">
              <p className="text-[10px] font-bold tracking-[0.12em] text-muted uppercase mb-3">⚡ 電気系</p>
              <table className="w-full text-xs">
                <tbody>
                  {[
                    ['発電機容量',    `${results.electrical.generatorKva.toFixed(1)} kVA`],
                    ['力率',          `${(inputs.powerFactor * 100).toFixed(0)} %`],
                    ['年間稼働時間',  `${inputs.operatingHours.toLocaleString()} h/年`],
                    ['設備利用率',    `${inputs.capacityFactor} %`],
                    ['年間発電量',    `${results.electrical.annualEnergy.toFixed(1)} MWh`],
                  ].map(([label, val], i) => (
                    <tr key={label} className={i % 2 === 0 ? 'bg-accent/[0.03]' : ''}>
                      <td className="py-1 pr-1 text-muted text-[10px] leading-tight">{label}</td>
                      <td className="py-1 font-mono text-accent font-semibold text-[11px] text-right">{val}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* 年間発電量ハイライト */}
              <div className="mt-3 pt-3 border-t border-border text-center">
                <div className="text-2xl font-bold font-mono text-ok leading-none">
                  {results.electrical.annualEnergy >= 1000
                    ? `${results.electrical.annualEnergyGwh.toFixed(3)} GWh`
                    : `${results.electrical.annualEnergy.toFixed(1)} MWh`}
                </div>
                <div className="text-[10px] text-muted mt-1">年間発電量</div>
              </div>
            </div>
          </div>

          {/* Row 2: chart + table */}
          <div className="grid grid-cols-2 gap-4 mt-3">
            <div className="bg-surface border border-border rounded-xl p-4">
              <p className="text-[10px] font-bold tracking-[0.12em] text-muted uppercase mb-3">効率曲線 η(Q/Qd)</p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={effData} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="q" tick={{ fontSize: 10, fill: '#7a90a8' }} tickFormatter={v => v + '%'} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#7a90a8' }} tickFormatter={v => v + '%'} />
                  <Tooltip
                    contentStyle={{ background: '#111827', border: '1px solid #2a3a52', borderRadius: 6, fontSize: 11 }}
                    formatter={(v: number, name: string) => [v.toFixed(1) + '%', name]}
                    labelFormatter={v => `Q/Qd = ${v}%`}
                  />
                  {[
                    { key: 'フランシス水車', color: '#38bdf8', dash: '' },
                    { key: 'カプラン水車',   color: '#34d399', dash: '4 3' },
                    { key: 'ペルトン水車',  color: '#a78bfa', dash: '2 2' },
                  ].map(({ key, color, dash }) => (
                    <Line key={key} type="monotone" dataKey={key}
                      stroke={results.turbineType === key ? color : color + '44'}
                      strokeWidth={results.turbineType === key ? 2.5 : 1.2}
                      strokeDasharray={dash} dot={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-surface border border-border rounded-xl p-4">
              <p className="text-[10px] font-bold tracking-[0.12em] text-muted uppercase mb-3">詳細計算値</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-1 px-1 text-muted font-normal text-[10px] tracking-wider uppercase">項目</th>
                    <th className="text-left py-1 px-1 text-muted font-normal text-[10px] tracking-wider uppercase">値</th>
                    <th className="text-left py-1 px-1 text-muted font-normal text-[10px] tracking-wider uppercase">区分</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['水車形式',         results.turbineType,                              '静的'],
                    ['定格回転速度',      Math.round(results.ratedRpm) + ' rpm',           '静的'],
                    ['極数',             results.poles + ' P',                             '静的'],
                    ['比速度 Ns',        results.specificSpeed.toFixed(2),                 '静的'],
                    ['水車出力 Pw',      results.turbinePower.toFixed(2) + ' kW',          '静的'],
                    ['発電機出力 Pe',    results.generatorPower.toFixed(2) + ' kW',        '静的'],
                    ['暴走速度',         Math.round(results.runawaySpeed) + ' rpm',        '動的'],
                    ['許容吸出し高さ',   results.hsMax != null ? results.hsMax.toFixed(2) + ' m' : '—', '動的'],
                    ['大気圧（補正後）', results.atmPressure.toFixed(3) + ' kPa',          '動的'],
                    ['キャビテーション係数σ_c', results.cavitationCoef != null ? results.cavitationCoef.toFixed(4) : '—', '導出'],
                  ].map(([label, val, type], i) => (
                    <tr key={label} className={i % 2 === 0 ? 'bg-accent/[0.03]' : ''}>
                      <td className="py-1.5 px-1 text-muted">{label}</td>
                      <td className="py-1.5 px-1 font-mono text-accent font-semibold">{val}</td>
                      <td className="py-1.5 px-1 text-[10px] text-muted">{type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          </>)}

          {/* ══ TAB: H-Q 選定図 ══ */}
          {mainTab === 'hq' && (
            <div className="bg-surface border border-border rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-bold text-text">H-Q 形式選定図</p>
                  <p className="text-[11px] text-muted mt-0.5">有効落差 H [m] と設計流量 Q [m³/s] による水車形式の適用範囲</p>
                </div>
                <div className="flex gap-4">
                  {hqRanges.map(r => (
                    <div key={r.id} className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-sm opacity-60" style={{ background: r.turbineType.color }} />
                      <span className="text-[11px] text-muted">{r.turbineType.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              <HQChart head={inputs.head} flowRate={inputs.flowRate} turbineType={results.turbineType} hqRanges={hqRanges} flowUnit={flowUnit} />

              <div className="mt-4 grid grid-cols-3 gap-3">
                {hqRanges.map(r => {
                  const inRange = inputs.head >= r.hMin && inputs.head <= r.hMax
                    && inputs.flowRate >= r.qMin && inputs.flowRate <= r.qMax
                  return (
                    <div key={r.id} className={`rounded-lg p-3 border ${inRange ? 'bg-accent/5 border-accent/30' : 'bg-surface2 border-border'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-2 h-2 rounded-full" style={{ background: r.turbineType.color }} />
                        <span className="text-xs font-semibold" style={{ color: inRange ? r.turbineType.color : '#7a90a8' }}>
                          {r.turbineType.name}
                        </span>
                        {inRange && <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded bg-ok/20 text-ok border border-ok/30">適用可</span>}
                      </div>
                      <div className="text-[10px] text-muted">
                        H: {r.hMin}〜{r.hMax} m<br/>
                        Q: {r.qMin}〜{r.qMax} m³/s
                      </div>
                      {r.note && <div className="text-[10px] text-muted mt-1 leading-tight">{r.note}</div>}
                      {r.source && <div className="text-[9px] text-muted/60 mt-1">出典: {r.source}</div>}
                    </div>
                  )
                })}
              </div>
              <p className="text-[10px] text-muted mt-3 text-right">※ 適用範囲は一般的な参考値です。詳細は製造者にご確認ください。</p>
            </div>
          )}

          {/* ══ TAB: Ns 分布図 ══ */}
          {mainTab === 'ns' && (
            <div className="bg-surface border border-border rounded-xl p-5">
              <div className="mb-4">
                <p className="text-sm font-bold text-text">比速度 Ns 分布図</p>
                <p className="text-[11px] text-muted mt-0.5">
                  比速度 Ns = n × √Pw ÷ H<sup>1.25</sup>　による形式選定の基準
                </p>
              </div>

              <NsChart ns={results.specificSpeed} turbineType={results.turbineType} nsRanges={nsRanges} />

              <div className="mt-5 grid grid-cols-3 gap-3">
                {nsRanges.map(r => {
                  const inRange = results.specificSpeed >= r.nsMin && results.specificSpeed <= r.nsMax
                  return (
                    <div key={r.id} className={`rounded-lg p-3 border ${inRange ? 'border-opacity-50' : 'bg-surface2 border-border'}`}
                      style={inRange ? { background: r.turbineType.color + '10', borderColor: r.turbineType.color + '50' } : {}}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">{r.turbineType.icon}</span>
                        <span className="text-xs font-semibold" style={{ color: inRange ? r.turbineType.color : '#7a90a8' }}>
                          {r.turbineType.name}
                        </span>
                        {inRange && <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded bg-ok/20 text-ok border border-ok/30">該当</span>}
                      </div>
                      <div className="text-[11px] font-mono" style={{ color: r.turbineType.color }}>
                        Ns: {r.nsMin} 〜 {r.nsMax}
                      </div>
                      <div className="mt-1.5 h-1.5 rounded-full bg-border overflow-hidden">
                        <div className="h-full rounded-full" style={{ background: r.turbineType.color, opacity: inRange ? 1 : 0.3, width: '100%' }} />
                      </div>
                      {inRange && (
                        <div className="mt-2 text-[10px] text-muted">
                          現在値 Ns = <span className="font-mono font-bold" style={{ color: r.turbineType.color }}>{results.specificSpeed.toFixed(1)}</span>
                        </div>
                      )}
                      {r.overlapNote && (
                        <div className="mt-1.5 text-[10px] text-muted leading-tight">{r.overlapNote}</div>
                      )}
                      {r.source && <div className="text-[9px] text-muted/60 mt-1">出典: {r.source}</div>}
                    </div>
                  )
                })}
              </div>

              <div className="mt-4 p-3 bg-surface2 border border-border rounded-lg text-[11px] text-muted leading-relaxed">
                <strong className="text-text">Ns の算出式：</strong>　Ns = n × √Pw ÷ H<sup>1.25</sup><br/>
                ペルトンとフランシスの適用範囲（Ns 60〜100）は重複します。この範囲では落差・流量・経済性を総合的に検討します。<br/>
                フランシスとカプランの境界（Ns 250〜400）も同様に重複適用範囲です。
              </div>
              <p className="text-[10px] text-muted mt-2 text-right">※ Ns範囲は一般的な参考値です。詳細は製造者にご確認ください。</p>
            </div>
          )}

          </div>
        </main>

        {/* ─── RIGHT: History / Projects sidebar ─── */}
        <aside className="w-[240px] flex-shrink-0 bg-surface border-l border-border overflow-y-auto flex flex-col">
          <div className="flex border-b border-border">
            {(['history', 'projects'] as const).map(tab => (
              <button key={tab} onClick={() => setSidebarTab(tab)}
                className={`flex-1 py-2.5 text-[11px] font-semibold transition-colors
                  ${sidebarTab === tab ? 'text-accent border-b-2 border-accent' : 'text-muted hover:text-text'}`}>
                {tab === 'history' ? '📋 履歴' : '📁 プロジェクト'}
              </button>
            ))}
          </div>

          {sidebarTab === 'history' && (
            <div className="flex-1 p-3 space-y-2">
              {history.length === 0 && <p className="text-xs text-muted text-center py-8">保存された計算がありません</p>}
              {history.map(h => (
                <button key={h.id} onClick={() => loadHistory(h.id)}
                  className="w-full text-left bg-surface2 border border-border rounded-lg p-2.5 hover:border-accent/50 transition-colors group">
                  <div className="text-xs font-semibold text-text group-hover:text-accent transition-colors truncate">{h.name}</div>
                  <div className="text-[10px] text-muted mt-0.5 truncate">{h.turbine_type}　{h.turbine_power.toFixed(0)} kW</div>
                  <div className="text-[10px] text-muted mt-0.5">H={h.head}m　Q={h.flow_rate}m³/s</div>
                  <div className="text-[9px] text-muted/60 mt-1">{new Date(h.created_at).toLocaleString('ja-JP')}</div>
                </button>
              ))}
            </div>
          )}

          {sidebarTab === 'projects' && (
            <div className="flex-1 p-3 space-y-2">
              {projects.length === 0 && <p className="text-xs text-muted text-center py-8">プロジェクトがありません</p>}
              {projects.map(p => (
                <div key={p.id} className="bg-surface2 border border-border rounded-lg p-2.5">
                  <div className="text-xs font-semibold text-text truncate">📁 {p.name}</div>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>

      {/* ─── Save Modal ─── */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-sm">
            <h2 className="text-base font-bold mb-4">計算結果を保存</h2>
            <div className="mb-3">
              <label className="block text-xs text-muted mb-1.5">ケース名 *</label>
              <input
                autoFocus value={saveName} onChange={e => setSaveName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
                placeholder="例：A案　H=50m Q=5m³/s"
                className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent transition-colors"
              />
            </div>
            {projects.length > 0 && (
              <div className="mb-4">
                <label className="block text-xs text-muted mb-1.5">プロジェクト（任意）</label>
                <select value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)}
                  className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent text-text">
                  <option value="">なし</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}
            <div className="text-xs text-muted mb-4 bg-surface2 rounded-lg p-2.5">
              {results.turbineType}　Pw={results.turbinePower.toFixed(1)} kW　Ns={results.specificSpeed.toFixed(1)}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowSaveModal(false)}
                className="flex-1 py-2 bg-surface2 border border-border text-muted rounded-lg text-sm hover:text-text transition-colors">
                キャンセル
              </button>
              <button onClick={handleSave} disabled={saving || !saveName.trim()}
                className="flex-1 py-2 bg-accent/15 border border-accent text-accent rounded-lg text-sm font-semibold hover:bg-accent/25 transition-colors disabled:opacity-50">
                {saving ? '保存中…' : '保存する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
