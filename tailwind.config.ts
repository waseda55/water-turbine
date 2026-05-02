import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // すべてCSS変数経由にすることでダーク/ライト切替に対応
        bg:       'var(--bg)',
        surface:  'var(--surface)',
        surface2: 'var(--surface2)',
        border:   'var(--border)',
        text:     'var(--text)',
        muted:    'var(--muted)',
        accent:   'var(--accent)',
        accent2:  'var(--accent2)',
        ok:       'var(--ok)',
        warn:     'var(--warn)',
        ng:       'var(--ng)',
        // 水車形式カラーは固定（選定図で使用）
        pelton:   '#a78bfa',
        francis:  '#38bdf8',
        kaplan:   '#34d399',
      },
      fontFamily: {
        sans: ['var(--font-noto)', 'sans-serif'],
        mono: ['var(--font-space-mono)', 'monospace'],
      },
    },
  },
  plugins: [],
}
export default config
