// ============================================================
// 水車選定ツール — 型定義
// ============================================================

// ---------- 入力パラメータ ----------
export interface TurbineInputs {
  head: number          // 有効落差 H [m]
  flowRate: number      // 設計流量 Q [m³/s]
  turbineEff: number    // 水車効率 η_t [%]
  generatorEff: number  // 発電機効率 η_g [%]
  suctionHead: number   // 吸出し高さ Hs [m]
  altitude: number      // 設置標高 [m]
  frequency: 50 | 60   // 電源周波数 [Hz]
  // ── 追加パラメータ ──
  powerFactor: number   // 力率 cos φ [0〜1]
  operatingHours: number // 年間稼働時間 [h/年]
  capacityFactor: number // 設備利用率 [%]
  penstock: {
    length: number      // 導水管延長 [m]
    material: 'steel' | 'ductile' | 'frp' // 管種
  }
}

// ---------- 計算結果 ----------
export type TurbineType = 'ペルトン水車' | 'フランシス水車' | 'カプラン水車'
export type CheckResult = 'OK' | 'NG' | '注意' | 'N/A'

export interface TurbineResults {
  turbineType: TurbineType
  turbinePower: number      // 水車出力 Pw [kW]
  generatorPower: number    // 発電機出力 Pe [kW]
  specificSpeed: number     // 比速度 Ns
  ratedRpm: number          // 定格回転速度 [rpm]
  poles: number             // 極数
  runawaySpeed: number      // 暴走速度 [rpm]
  cavitationCoef: number | null
  hsMax: number | null
  atmPressure: number
  runawayCoeff: number

  // ── 寸法系 ──
  dimensions: {
    runnerDiameter: number        // ランナー径 D [m]
    draftTubeDiameter: number | null  // 吸出し管径 [m]（フランシス/カプランのみ）
    casingDiameter: number | null     // ケーシング概略径 [m]
    penstockDiameter: number          // 導水管径 [m]
    penstockVelocity: number          // 導水管流速 [m/s]
  }

  // ── 水理・構造系 ──
  hydraulics: {
    gd2: number                   // フライホイール効果 GD² [kN·m²]
    waterHammerRise: number       // 水撃圧上昇率 ΔH/H [%]
    waterHammerHead: number       // 水撃圧上昇値 ΔH [m]
    penstock: {
      headLoss: number            // 管路損失 hf [m]
      headLossRatio: number       // 損失率 hf/H [%]
    }
  }

  // ── 電気系 ──
  electrical: {
    generatorKva: number          // 発電機容量 [kVA]
    annualEnergy: number          // 年間発電量 [MWh/年]
    annualEnergyGwh: number       // 年間発電量 [GWh/年]
  }

  checks: {
    cavitation: { result: CheckResult; message: string }
    specificSpeed: { result: CheckResult; message: string }
    altitude: { result: CheckResult; message: string }
    runaway: { message: string }
    headLoss: { result: CheckResult; message: string }
    waterHammer: { result: CheckResult; message: string }
  }
}

// ---------- DB 行 ----------
export interface Project {
  id: string
  userId: string
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
}

export interface Calculation {
  id: string
  userId: string
  projectId: string | null
  name: string
  inputs: TurbineInputs
  results: TurbineResults
  memo: string | null
  createdAt: string
}

// ─── 選定図マスタ ───────────────────────────────────────────

export interface TurbineTypeMaster {
  id: number
  name: string
  icon: string
  color: string
  sortOrder: number
}

export interface HQPoint { q: number; h: number }

export interface HQRange {
  id: number
  turbineTypeId: number
  turbineType: TurbineTypeMaster
  boundaryPoints: HQPoint[]
  hMin: number; hMax: number
  qMin: number; qMax: number
  source: string | null
  note: string | null
  version: string
}

export interface NsRange {
  id: number
  turbineTypeId: number
  turbineType: TurbineTypeMaster
  nsMin: number
  nsMax: number
  overlapNote: string | null
  source: string | null
  note: string | null
  version: string
}

// ─── Supabase DB 型（snake_case）への追記 ──────────────────
export interface Database {
  public: {
    Tables: {
      projects: {
        Row: {
          id: string
          user_id: string
          name: string
          description: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['projects']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['projects']['Insert']>
      }
      calculations: {
        Row: {
          id: string
          user_id: string
          project_id: string | null
          name: string
          head: number
          flow_rate: number
          turbine_eff: number
          generator_eff: number
          suction_head: number
          altitude: number
          frequency: number
          turbine_type: string
          turbine_power: number
          generator_power: number
          specific_speed: number
          rated_rpm: number
          poles: number
          runaway_speed: number
          cavitation_coef: number | null
          hs_max: number | null
          atm_pressure: number
          check_cavitation: string | null
          check_ns: string
          check_altitude: string
          memo: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['calculations']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['calculations']['Insert']>
      }
    }
  }
}
