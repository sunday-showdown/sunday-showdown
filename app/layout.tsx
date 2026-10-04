import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Sunday Showdown',
    template: '%s · Sunday Showdown',
  },
  description:
    'Pick NFL games against your friends every week. Moneyline, spread and totals, one pick per game, settled automatically.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Sunday Showdown',
    statusBarStyle: 'black-translucent',
  },
  openGraph: {
    title: 'Sunday Showdown',
    description: 'Pick NFL games against your friends every week.',
    type: 'website',
  },
  // A private friends-group app has no reason to be indexed.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#090b10',
  width: 'device-width',
  initialScale: 1,
  // Not user-scalable: this is an installed app shell, and pinch-zoom on a
  // fixed bottom nav fights the layout. Text still scales with system settings.
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
