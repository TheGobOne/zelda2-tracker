import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import './globals.css'

// "Zelda II: The Adventure of Link" by Patrick H. Lauke, a recreation of the
// NES game's tile set. Licensed CC-BY 3.0; see public/fonts/zelda2-license.txt.
const pixelFont = localFont({
  src: [
    { path: '../public/fonts/zelda2.woff2', style: 'normal', weight: '400' },
    { path: '../public/fonts/zelda2.otf', style: 'normal', weight: '400' },
  ],
  variable: '--font-pixel',
  // This is the app-wide default, but the glyphs are fixed-size tiles, so
  // scaling a fallback to match them would distort more than it helps.
  adjustFontFallback: false,
  fallback: ['monospace'],
})

export const metadata: Metadata = {
  title: 'Zelda II Randomizer Tracker',
  description: 'A tracker for Zelda II Randomizer by TheGobOne',
  generator: 'v0.app',
  applicationName: 'Z2 Tracker',
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: { url: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
  },
  appleWebApp: {
    capable: true,
    title: 'Z2 Tracker',
    statusBarStyle: 'black',
  },
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="bg-background">
      <body className={`${pixelFont.variable} font-sans`}>
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
