# 水車選定ツール — Next.js + Supabase

HPP Design（45 Engineering, Italy）比較検証版

## 技術スタック

| 層 | 技術 |
|---|---|
| フレームワーク | Next.js 14 (App Router) |
| 言語 | TypeScript |
| スタイリング | Tailwind CSS |
| バックエンド/DB | Supabase (PostgreSQL + Auth) |
| グラフ | Recharts |
| デプロイ | Vercel |

---

## 🚀 デプロイ手順（GitHub → Vercel）

### STEP 1 — GitHubにリポジトリを作成してプッシュ

```bash
# ZIPを解凍したフォルダで作業
cd water-turbine

# Gitリポジトリを初期化
git init

# 全ファイルをステージング
git add .

# 最初のコミット
git commit -m "feat: 水車選定ツール 初回コミット"

# GitHubで新しいリポジトリを作成後、以下を実行
# （GitHubの「New repository」ページで取得したURLを使用）
git remote add origin https://github.com/<あなたのユーザー名>/water-turbine.git
git branch -M main
git push -u origin main
```

> **GitHubでのリポジトリ作成手順**
> 1. https://github.com/new を開く
> 2. Repository name: `water-turbine`
> 3. Private（社内ツールなので推奨）を選択
> 4. **「Add a README file」のチェックは外す**（既にあるため）
> 5. 「Create repository」をクリック
> 6. 表示された `git remote add origin ...` のコマンドをコピーして実行

---

### STEP 2 — Supabaseの設定

#### 2-1. プロジェクト作成
1. https://supabase.com/dashboard でプロジェクトを作成
2. リージョン: **Northeast Asia (Tokyo)** を推奨

#### 2-2. データベースのマイグレーション
Supabaseダッシュボード → **SQL Editor** を開き、以下を順番に実行：

```
supabase/migrations/001_initial_schema.sql
supabase/migrations/002_selection_ranges.sql
```

#### 2-3. Google OAuth の設定（任意）
1. [Google Cloud Console](https://console.cloud.google.com) でOAuth 2.0クライアントIDを作成
2. 承認済みリダイレクトURIに追加:
   ```
   https://<your-project>.supabase.co/auth/v1/callback
   ```
3. Supabaseダッシュボード → **Authentication → Providers → Google** で有効化し、Client ID / Secret を設定

#### 2-4. APIキーを控える
Supabaseダッシュボード → **Settings → API** から以下をコピー:
- `Project URL`
- `anon public` キー
- `service_role` キー（Vercelのサーバー側のみで使用）

---

### STEP 3 — Vercelにデプロイ

1. https://vercel.com/dashboard を開く
2. **「Add New → Project」** をクリック
3. **「Import Git Repository」** でSTEP 1で作成したリポジトリを選択
4. **Framework Preset** が `Next.js` になっていることを確認
5. **「Environment Variables」** を展開し、以下の3つを追加:

| Key | Value |
|-----|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | SupabaseのProject URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabaseのanon publicキー |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabaseのservice roleキー |

6. **「Deploy」** をクリック → 約2分でデプロイ完了 🎉

---

### STEP 4 — SupabaseにVercelのURLを登録

デプロイ完了後、VercelからURLが発行されます（例: `https://water-turbine-xxx.vercel.app`）。

Supabaseダッシュボード → **Authentication → URL Configuration** で設定:

| 項目 | 値 |
|------|-----|
| Site URL | `https://water-turbine-xxx.vercel.app` |
| Redirect URLs | `https://water-turbine-xxx.vercel.app/**` |

Google OAuthを使う場合は、Google Cloud ConsoleのリダイレクトURIにも追加:
```
https://water-turbine-xxx.vercel.app/auth/callback
```

---

### STEP 5 — 動作確認

1. Vercelの発行URLにアクセス
2. 新規登録またはGoogleログインでサインイン
3. 水車パラメータを入力して計算結果を確認
4. 💾 保存ボタンで計算履歴が保存されることを確認

---

## ローカル開発

```bash
# 依存パッケージのインストール
npm install

# 環境変数の設定
cp .env.local.example .env.local
# .env.local にSupabaseのキーを貼り付け

# 開発サーバー起動
npm run dev
# → http://localhost:3000 で確認
```

---

## プロジェクト構成

```
water-turbine/
├── src/
│   ├── app/
│   │   ├── auth/
│   │   │   ├── login/          # ログイン・新規登録
│   │   │   └── callback/       # Google OAuth コールバック
│   │   ├── dashboard/
│   │   │   ├── page.tsx        # Server Component（データ取得）
│   │   │   └── DashboardClient.tsx  # メインUI
│   │   └── api/
│   │       ├── calculations/   # 計算履歴 API
│   │       └── projects/       # プロジェクト CRUD API
│   ├── lib/
│   │   ├── turbine-calc.ts     # 計算エンジン（純粋関数）
│   │   ├── selection-ranges.ts # 選定図マスタ取得
│   │   └── supabase/
│   │       ├── client.ts       # ブラウザ用クライアント
│   │       └── server.ts       # サーバー用クライアント
│   ├── types/index.ts          # 全型定義
│   └── middleware.ts           # 認証ガード
└── supabase/
    └── migrations/
        ├── 001_initial_schema.sql   # users / calculations / projects
        └── 002_selection_ranges.sql # 選定図マスタ（H-Q / Ns範囲）
```

---

## 機能一覧

- ✅ 水車形式自動判定（ペルトン / フランシス / カプラン）
- ✅ リアルタイム計算（スライダー + 数値入力の双方向同期）
- ✅ 寸法系（ランナー径・吸出し管径・ケーシング径・導水管径）
- ✅ 水理・構造系（GD²・水撃圧・管路損失）
- ✅ 電気系（発電機容量・年間発電量）
- ✅ 判定バッジ（キャビテーション / 比速度 / 標高 / 水撃圧 / 管路損失）
- ✅ H-Q 形式選定図（対数スケール・DBで範囲管理）
- ✅ Ns 分布図（DBで範囲管理）
- ✅ 効率曲線グラフ
- ✅ ダーク / ライトモード切替
- ✅ ユーザー認証（メール/パスワード + Google OAuth）
- ✅ 計算結果の保存・履歴管理（Supabase DB + RLS）
- ✅ プロジェクト（案件）管理
- ✅ 履歴からのパラメータ復元

---

## 今後の拡張ポイント

- `src/lib/turbine-calc.ts` — 計算式のカスタマイズ
- `supabase/migrations/` — テーブル追加・カラム追加
- `supabase/migrations/002_selection_ranges.sql` のシードデータ — 適用範囲の調整
