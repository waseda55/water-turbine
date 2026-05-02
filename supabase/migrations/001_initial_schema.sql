-- ============================================================
-- 水車選定ツール — Supabase スキーマ
-- ============================================================

-- プロジェクト（案件）テーブル
CREATE TABLE IF NOT EXISTS projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 計算結果テーブル
CREATE TABLE IF NOT EXISTS calculations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id      UUID REFERENCES projects(id) ON DELETE SET NULL,
  name            TEXT NOT NULL DEFAULT '無題',

  -- 入力パラメータ
  head            NUMERIC(10,3) NOT NULL,   -- 有効落差 H [m]
  flow_rate       NUMERIC(10,4) NOT NULL,   -- 設計流量 Q [m³/s]
  turbine_eff     NUMERIC(5,2)  NOT NULL,   -- 水車効率 η_t [%]
  generator_eff   NUMERIC(5,2)  NOT NULL,   -- 発電機効率 η_g [%]
  suction_head    NUMERIC(7,2)  NOT NULL,   -- 吸出し高さ Hs [m]
  altitude        NUMERIC(7,1)  NOT NULL,   -- 設置標高 [m]
  frequency       SMALLINT      NOT NULL CHECK (frequency IN (50, 60)),

  -- 計算結果
  turbine_type    TEXT          NOT NULL,   -- ペルトン / フランシス / カプラン
  turbine_power   NUMERIC(12,3) NOT NULL,   -- 水車出力 Pw [kW]
  generator_power NUMERIC(12,3) NOT NULL,   -- 発電機出力 Pe [kW]
  specific_speed  NUMERIC(10,3) NOT NULL,   -- 比速度 Ns
  rated_rpm       NUMERIC(8,1)  NOT NULL,   -- 定格回転速度 [rpm]
  poles           SMALLINT      NOT NULL,   -- 極数
  runaway_speed   NUMERIC(8,1)  NOT NULL,   -- 暴走速度 [rpm]
  cavitation_coef NUMERIC(10,6),            -- キャビテーション係数 σ_c
  hs_max          NUMERIC(8,3),             -- 許容吸出し高さ [m]
  atm_pressure    NUMERIC(8,4)  NOT NULL,   -- 大気圧（補正後）[kPa]

  -- 判定結果
  check_cavitation TEXT,                    -- OK / NG / N/A
  check_ns         TEXT NOT NULL,           -- OK / 注意
  check_altitude   TEXT NOT NULL,           -- OK / 注意

  memo            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS (Row Level Security)
ALTER TABLE projects     ENABLE ROW LEVEL SECURITY;
ALTER TABLE calculations ENABLE ROW LEVEL SECURITY;

-- ユーザーは自分のデータのみ操作可能
CREATE POLICY "projects: own data" ON projects
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "calculations: own data" ON calculations
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- updated_at 自動更新トリガー
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- インデックス
CREATE INDEX idx_calculations_user_id    ON calculations(user_id);
CREATE INDEX idx_calculations_project_id ON calculations(project_id);
CREATE INDEX idx_calculations_created_at ON calculations(created_at DESC);
CREATE INDEX idx_projects_user_id        ON projects(user_id);
