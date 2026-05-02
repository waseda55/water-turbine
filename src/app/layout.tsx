import type { Metadata } from 'next'
import { Noto_Sans_JP, Space_Mono } from 'next/font/google'
import './globals.css'

const noto = Noto_Sans_JP({
  subsets: ['latin'],
  weight: ['300', '400', '500', '700'],
  variable: '--font-noto',
})
const spaceMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-space-mono',
})

export const metadata: Metadata = {
  title: '水車選定ツール',
  description: '計算式・パラメータ・判定ロジック — HPP Design 比較検証版',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={`${noto.variable} ${spaceMono.variable}`}>
      <body className="bg-bg text-text font-sans antialiased">{children}</body>
    </html>
  )
}
