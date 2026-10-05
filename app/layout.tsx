import type { Metadata, Viewport } from 'next';
import { Inter, Anton } from 'next/font/google';
import './globals.css';
import ServiceWorkerRegistration from '@/components/ServiceWorkerRegistration';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

// A tall condensed face for headings and scores — the broadcast-graphic voice
// the app is going for. Body copy stays on Inter, which is far more readable at
// small sizes on a phone.
const anton = Anton({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-anton',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Sunday Showdown',
    template: '%s · Sunday Showdown',
  },
  description:
    'Pick NFL games against your friends every week. Every pick is a $10 bet — you score what it pays.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Showdown',
    statusBarStyle: 'black-translucent',
  },
  openGraph: {
    title: 'Sunday Showdown',
    description: 'Pick NFL games against your friends every week.',
    type: 'website',
  },
  // A private friends-group app has no reason to be indexed.
  robots: { index: false, follow: false },
  formatDetection: { telephone: false, date: false, address: false, email: false },
};

export const viewport: Viewport = {
  themeColor: '#070506',
  width: 'device-width',
  initialScale: 1,
  // Not user-scalable: this is an installed app shell, and pinch-zoom on a
  // fixed bottom nav fights the layout. Text still scales with system settings.
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${anton.variable}`}>
      <body>
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
