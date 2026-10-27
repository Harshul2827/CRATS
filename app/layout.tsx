import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import './globals.css'
import { AppProviders } from '@/components/app/providers'
import { isDemoMode } from '@/server/lib/env'

export const metadata: Metadata = {
  title: 'CRATS • SPIT Mumbai',
  description: 'Campus recruitment and placement management webapp for SPIT Mumbai.',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: 'black' },
  ],
}

// Runs before first paint so the saved theme never flashes. The `dark` class lives on <html>
// so dialogs and popovers (rendered in portals) are themed too.
const themeScript = `try{var t=localStorage.getItem('crats-theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d)}catch(e){}`

// Read at request time so DEMO_MODE changes apply without a rebuild.
export const dynamic = 'force-dynamic'

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="antialiased">
        <AppProviders demoMode={isDemoMode()}>{children}</AppProviders>
        {/* The insights script only exists on Vercel; elsewhere it would 404 in the console. */}
        {process.env.VERCEL === '1' && <Analytics />}
      </body>
    </html>
  )
}
