import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono, Instrument_Serif } from 'next/font/google';
import { Providers } from '@/components/providers';
import { Analytics } from '@vercel/analytics/next';
import { LazyFeedbackWidget } from '@/components/feedback/lazy-feedback-widget';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
  display: 'swap',
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  display: 'swap',
});

const instrumentSerif = Instrument_Serif({
  variable: '--font-instrument-serif',
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  fallback: ['Georgia', 'serif'],
  adjustFontFallback: true,
});

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Sastram - AI-Powered Discussion & Research Platform',
    template: '%s | Sastram',
  },
  description:
    'Sastram is an AI-powered discussion and research platform. Verified resolutions, thread DNA, AI-assisted search, and collaborative collections.',
  applicationName: 'Sastram',
  authors: [{ name: 'Sastram' }],
  category: 'technology',
  keywords: [
    'forum',
    'discussion',
    'research',
    'AI search',
    'thread DNA',
    'verified resolution',
    'knowledge base',
  ],
  openGraph: {
    type: 'website',
    url: siteUrl,
    siteName: 'Sastram',
    title: 'Sastram - AI-Powered Discussion & Research Platform',
    description:
      'Sastram is an AI-powered discussion and research platform. Verified resolutions, thread DNA, AI-assisted search, and collaborative collections.',
    images: [
      {
        url: '/sastram-image-light.png',
        width: 1200,
        height: 630,
        alt: 'Sastram - AI-Powered Discussion & Research Platform',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sastram - AI-Powered Discussion & Research Platform',
    description:
      'Sastram is an AI-powered discussion and research platform. Verified resolutions, thread DNA, AI-assisted search, and collaborative collections.',
    images: ['/sastram-image-light.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: '/favicon.ico',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0f0f14' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} antialiased`}
      >
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-background focus:text-foreground focus:border focus:rounded-control"
        >
          Skip to main content
        </a>
        <Analytics />
        <Providers>{children}</Providers>
        <LazyFeedbackWidget />
      </body>
    </html>
  );
}
