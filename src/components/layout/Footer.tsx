import Link from 'next/link';
import { Rss, Mail } from 'lucide-react';
import { XIcon, FacebookIcon, InstagramIcon } from '@/components/ui/SocialIcons';
import { prisma } from '@/lib/db';
import Logo from '@/components/ui/Logo';
import { BRAND } from '@/config/brand';
import { DISPLAY_CATEGORIES } from '@/config/categories';

export default async function Footer() {
  const year = new Date().getFullYear();
  const displaySlugs = DISPLAY_CATEGORIES.map((c) => c.slug);
  const rawCategories = await prisma.category.findMany({
    where: { slug: { in: displaySlugs } },
    select: { name: true, slug: true },
  });
  // Sort by DISPLAY_CATEGORIES order
  const categories = DISPLAY_CATEGORIES
    .map((dc) => rawCategories.find((c) => c.slug === dc.slug))
    .filter((c): c is { name: string; slug: string } => c != null);

  return (
    <footer className="bg-slate-900 text-slate-400 mt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="md:col-span-1">
            <Link href="/" className="inline-flex flex-col leading-none mb-3">
              <Logo />
            </Link>
            <p className="text-sm leading-relaxed mb-4">
              {BRAND.tagline} Ελλάδα, Κόσμος, Οικονομία, Υγεία, Media και ό,τι
              αξίζει να ξέρεις — κάθε μέρα.
            </p>
            <div className="flex items-center gap-3">
              {BRAND.twitter && (
                <a
                  href={BRAND.twitter}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white transition-colors"
                  aria-label="Twitter"
                >
                  <XIcon size={18} />
                </a>
              )}
              {BRAND.facebook && (
                <a
                  href={BRAND.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white transition-colors"
                  aria-label="Facebook"
                >
                  <FacebookIcon size={18} />
                </a>
              )}
              {BRAND.instagram && (
                <a
                  href={BRAND.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white transition-colors"
                  aria-label="Instagram"
                >
                  <InstagramIcon size={18} />
                </a>
              )}
              <a
                href="/feed.xml"
                className="hover:text-white transition-colors"
                aria-label="RSS Feed"
              >
                <Rss size={18} />
              </a>
            </div>
          </div>

          {/* Categories */}
          <div>
            <h3 className="text-white font-semibold text-sm uppercase tracking-wider mb-4">
              Κατηγορίες
            </h3>
            <ul className="space-y-2">
              {categories.map((cat) => (
                <li key={cat.slug}>
                  <Link
                    href={`/category/${cat.slug}`}
                    className="text-sm hover:text-white transition-colors"
                  >
                    {cat.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Pages */}
          <div>
            <h3 className="text-white font-semibold text-sm uppercase tracking-wider mb-4">
              Σελίδες
            </h3>
            <ul className="space-y-2">
              {[
                { label: 'Αρχική', href: '/' },
                { label: 'Όλα τα Άρθρα', href: '/articles' },
                { label: 'Σχετικά με εμάς', href: '/about' },
                { label: 'Επικοινωνία', href: '/contact' },
                { label: 'Πολιτική Απορρήτου', href: '/privacy-policy' },
              ].map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm hover:text-white transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Newsletter mini */}
          <div>
            <h3 className="text-white font-semibold text-sm uppercase tracking-wider mb-4">
              Newsletter
            </h3>
            <p className="text-sm mb-3">
              Λάβε τα σημαντικότερα άρθρα κάθε πρωί στο inbox σου.
            </p>
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="email@σου.gr"
                className="flex-1 bg-slate-800 border border-slate-700 text-white text-sm rounded px-3 py-2 focus:outline-none focus:border-red-500 placeholder-slate-500"
              />
              <button className="bg-red-600 hover:bg-red-700 text-white p-2 rounded transition-colors">
                <Mail size={16} />
              </button>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-800 mt-10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <p>© {year} {BRAND.name} — {new URL(BRAND.domain).hostname}. Όλα τα δικαιώματα διατηρούνται.</p>
          <p className="flex items-center gap-1">
            Φτιαγμένο με ❤️ στην Ελλάδα
          </p>
        </div>
      </div>
    </footer>
  );
}
