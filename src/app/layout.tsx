import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import HeaderWrapper from '@/components/layout/HeaderWrapper';
import Footer from '@/components/layout/Footer';
import ThemeProvider from '@/components/ThemeProvider';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://aisxoliasmos.gr'),
  title: {
    default: 'ΑΙΣΧΟΛΙΑΣΜΟΣ — Η επικαιρότητα με έξυπνο σχολιασμό',
    template: '%s | ΑΙΣΧΟΛΙΑΣΜΟΣ',
  },
  description:
    'Ενημερωτικό portal για AI, Τεχνολογία, Οικονομία, Επιχειρηματικότητα και Επικαιρότητα. Έξυπνος σχολιασμός, καθημερινά.',
  keywords: ['AI', 'τεχνολογία', 'οικονομία', 'ειδήσεις', 'Ελλάδα', 'επιχειρηματικότητα'],
  authors: [{ name: 'ΑΙΣΧΟΛΙΑΣΜΟΣ', url: 'https://aisxoliasmos.gr' }],
  openGraph: {
    type: 'website',
    locale: 'el_GR',
    url: 'https://aisxoliasmos.gr',
    siteName: 'ΑΙΣΧΟΛΙΑΣΜΟΣ',
    title: 'ΑΙΣΧΟΛΙΑΣΜΟΣ — Η επικαιρότητα με έξυπνο σχολιασμό',
    description:
      'Ενημερωτικό portal για AI, Τεχνολογία, Οικονομία, Επιχειρηματικότητα και Επικαιρότητα.',
  },
  twitter: {
    card: 'summary_large_image',
    site: '@aisxoliasmos',
    creator: '@aisxoliasmos',
    title: 'ΑΙΣΧΟΛΙΑΣΜΟΣ',
    description: 'Η επικαιρότητα με έξυπνο σχολιασμό.',
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="el" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <body className="antialiased bg-slate-50 dark:bg-slate-900 transition-colors duration-200">
        <ThemeProvider>
          <HeaderWrapper />
          <main className="min-h-screen">{children}</main>
          <Footer />
        </ThemeProvider>
      </body>
    </html>
  );
}
