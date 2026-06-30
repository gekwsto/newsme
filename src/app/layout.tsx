import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import HeaderWrapper from '@/components/layout/HeaderWrapper';
import Footer from '@/components/layout/Footer';
import ThemeProvider from '@/components/ThemeProvider';
import { BRAND } from '@/config/brand';
import { SITE } from '@/config/site';
import { organizationJsonLd } from '@/lib/seo';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL(BRAND.domain),
  title: {
    default: `${BRAND.name} — ${BRAND.tagline}`,
    template: `%s | ${BRAND.name}`,
  },
  description: BRAND.description,
  keywords: ['AI', 'τεχνολογία', 'οικονομία', 'ειδήσεις', 'Ελλάδα', 'επιχειρηματικότητα'],
  authors: [{ name: BRAND.author, url: BRAND.domain }],
  openGraph: {
    type: 'website',
    locale: SITE.locale,
    url: BRAND.domain,
    siteName: BRAND.name,
    title: `${BRAND.name} — ${BRAND.tagline}`,
    description: BRAND.description,
  },
  twitter: {
    card: 'summary_large_image',
    site: BRAND.twitterHandle,
    creator: BRAND.twitterHandle,
    title: BRAND.name,
    description: BRAND.tagline,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang={SITE.language} className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <body className="antialiased bg-slate-50 dark:bg-slate-900 transition-colors duration-200">
        {/* Global NewsMediaOrganization schema — rendered once for every page */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd()) }}
        />
        <ThemeProvider>
          <HeaderWrapper />
          <main className="min-h-screen">{children}</main>
          <Footer />
        </ThemeProvider>
      </body>
    </html>
  );
}
