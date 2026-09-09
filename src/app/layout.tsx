import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { SessionProvider } from '@/context/session'
import { ServiceWorkerRegistration } from '@/components/service-worker-registration'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-app-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'MBA Player',
    template: '%s · MBA Player',
  },
  description:
    'Lecteur multimédia pour portails Xtream Codes : TV en direct, films et séries, dans le navigateur.',
  applicationName: 'MBA Player',
  appleWebApp: {
    capable: true,
    title: 'MBA Player',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  themeColor: '#07070b',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={inter.variable}>
      <body className="min-h-dvh antialiased">
        <SessionProvider>{children}</SessionProvider>
        <ServiceWorkerRegistration />
      </body>
    </html>
  )
}
