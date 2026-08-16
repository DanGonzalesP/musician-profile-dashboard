import type { Metadata, Viewport } from 'next'
import { Geist_Mono, Plus_Jakarta_Sans, Unbounded } from 'next/font/google'
import './globals.css'
import { SITE_URL } from '@/lib/site'
import { ThemeScript } from '@/components/theme-script'
import { LocaleProvider } from '@/components/locale-provider'
import { ToastProvider } from '@/components/toast-provider'
import { ConsentimientoCookies } from '@/components/legal/consentimiento-cookies'
import { headers } from 'next/headers'

const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-jakarta' })
const unbounded = Unbounded({ subsets: ['latin'], variable: '--font-unbounded' })
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' })

export const metadata: Metadata = {
  // metadataBase resuelve a absolutas todas las URLs relativas de los
  // metadatos (canonical, openGraph.url, imágenes). Sin esto, las redes
  // sociales descartan la tarjeta al recibir una ruta relativa.
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Vibe — Tu música, tu escenario',
    // Cada perfil define su propio título completo; esta plantilla cubre el
    // resto de las páginas.
    template: '%s',
  },
  description: 'Vibe: la plataforma donde músicos de todos los rubros publican su música, su trayectoria, su tienda y sus servicios en un solo perfil.',
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
  colorScheme: 'dark',
  themeColor: '#0a0a0a',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const nonce = (await headers()).get('x-nonce') ?? undefined

  return (
    <html
      lang="es"
      className={`bg-background ${jakarta.variable} ${unbounded.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript nonce={nonce} />
      </head>
      <body className="font-sans antialiased">
        <LocaleProvider>
          <ToastProvider>{children}</ToastProvider>
        </LocaleProvider>
        {/* La analítica ya no se monta sola: la monta el consentimiento, y
            sólo tras un sí explícito (P-31). Ver components/legal/. */}
        <ConsentimientoCookies />
      </body>
    </html>
  )
}
