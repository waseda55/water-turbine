-- ============================================================
-- 水車選定ツール — Migration 002
-- 選定図の適用範囲テーブル
-- ============================================================

-- ── 水車形式マスタ ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS turbine_types (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,   -- ペルトン水車 / フランシス水車 / カプラン水車
  icon        TEXT NOT NULL,          -- 表示アイコン（絵文字）
  color       TEXT NOT NULL,          -- 表示カラー（HEX）
  sort_order  SMALLINT NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── H-Q 適用範囲テーブル ────────────────────────────────────
CREATE TABLE IF NOT EXISTS hq_ranges (
  id              SERIAL PRIMARY KEY,
  turbine_type_id INTEGER NOT NULL REFERENCES turbine_types(id) ON DELETE CASCADE,

  -- H-Q 境界ポリゴン（対数スケールプロット用）
  -- JSONB配列: [{"q": 0.05, "h": 50}, ...]
  boundary_points JSONB NOT NULL,

  -- 簡易判定用の矩形範囲（境界ポリゴンの包含矩形）
  h_min   NUMERIC(10,3) NOT NULL,   -- 最小有効落差 [m]
  h_max   NUMERIC(10,3) NOT NULL,   -- 最大有効落差 [m]
  q_min   NUMERIC(10,4) NOT NULL,   -- 最小設計流量 [m³/s]
  q_max   NUMERIC(10,4) NOT NULL,   -- 最大設計流量 [m³/s]

  -- メモ・出典
  source  TEXT,                     -- 出典・参考文献
  note    TEXT,                     -- 備考
  version TEXT NOT NULL DEFAULT '1.0',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Ns 適用範囲テーブル ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS ns_ranges (
  id              SERIAL PRIMARY KEY,
  turbine_type_id INTEGER NOT NULL REFERENCES turbine_types(id) ON DELETE CASCADE,

  ns_min  NUMERIC(8,2) NOT NULL,    -- 比速度 最小値
  ns_max  NUMERIC(8,2) NOT NULL,    -- 比速度 最大値

  -- 重複範囲の注記（例: ペルトン/フランシスの境界）
  overlap_note TEXT,

  source  TEXT,
  note    TEXT,
  version TEXT NOT NULL DEFAULT '1.0',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── RLS ─────────────────────────────────────────────────────
-- マスタデータは全ユーザーが読み取り可能、書き込みはサービスロールのみ
ALTER TABLE turbine_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE hq_ranges     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ns_ranges     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "turbine_types: public read" ON turbine_types
  FOR SELECT USING (TRUE);

CREATE POLICY "hq_ranges: public read" ON hq_ranges
  FOR SELECT USING (TRUE);

CREATE POLICY "ns_ranges: public read" ON ns_ranges
  FOR SELECT USING (TRUE);

-- ── updated_at トリガー ──────────────────────────────────────
CREATE TRIGGER trg_turbine_types_updated_at
  BEFORE UPDATE ON turbine_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_hq_ranges_updated_at
  BEFORE UPDATE ON hq_ranges
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_ns_ranges_updated_at
  BEFORE UPDATE ON ns_ranges
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── インデックス ─────────────────────────────────────────────
CREATE INDEX idx_hq_ranges_turbine_type_id ON hq_ranges(turbine_type_id);
CREATE INDEX idx_ns_ranges_turbine_type_id ON ns_ranges(turbine_type_id);

-- ============================================================
-- シードデータ（初期値）
-- ============================================================

INSERT INTO turbine_types (name, icon, color, sort_order) VALUES
  ('ペルトン水車',   '💧', '#a78bfa', 1),
  ('フランシス水車', '🌊', '#38bdf8', 2),
  ('カプラン水車',   '🌀', '#34d399', 3);

-- H-Q 境界ポリゴン（実務参考値、IEC 60193 等に基づく一般的な範囲）
INSERT INTO hq_ranges (turbine_type_id, boundary_points, h_min, h_max, q_min, q_max, source, note)
VALUES
(
  (SELECT id FROM turbine_types WHERE name = 'ペルトン水車'),
  '[{"q":0.05,"h":50},{"q":0.05,"h":1100},{"q":60,"h":1100},{"q":60,"h":300},{"q":5,"h":100},{"q":0.5,"h":50}]',
  50, 1100, 0.05, 60,
  'IEC 60193 / 実務参考値',
  '高落差・小〜中流量に適用。衝動式水車のため吸出し管不要。'
),
(
  (SELECT id FROM turbine_types WHERE name = 'フランシス水車'),
  '[{"q":0.1,"h":15},{"q":0.1,"h":700},{"q":150,"h":700},{"q":250,"h":400},{"q":250,"h":15}]',
  15, 700, 0.1, 250,
  'IEC 60193 / 実務参考値',
  '中落差・中〜大流量に最も広く適用される反動式水車。'
),
(
  (SELECT id FROM turbine_types WHERE name = 'カプラン水車'),
  '[{"q":0.5,"h":2},{"q":0.5,"h":80},{"q":500,"h":80},{"q":500,"h":2}]',
  2, 80, 0.5, 500,
  'IEC 60193 / 実務参考値',
  '低落差・大流量に適用。可動羽根により部分負荷効率に優れる。'
);

-- Ns 適用範囲
INSERT INTO ns_ranges (turbine_type_id, ns_min, ns_max, overlap_note, source, note)
VALUES
(
  (SELECT id FROM turbine_types WHERE name = 'ペルトン水車'),
  10, 100,
  'Ns=60〜100 はフランシス水車との重複範囲。経済性・設置条件で選定。',
  'IEC 60193 / 実務参考値',
  NULL
),
(
  (SELECT id FROM turbine_types WHERE name = 'フランシス水車'),
  60, 400,
  'Ns=60〜100 はペルトン、Ns=250〜400 はカプランとの重複範囲。',
  'IEC 60193 / 実務参考値',
  NULL
),
(
  (SELECT id FROM turbine_types WHERE name = 'カプラン水車'),
  250, 900,
  'Ns=250〜400 はフランシス水車との重複範囲。',
  'IEC 60193 / 実務参考値',
  NULL
);
