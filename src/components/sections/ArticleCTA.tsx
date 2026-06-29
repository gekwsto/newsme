import { FacebookIcon } from '@/components/ui/SocialIcons';
import { MessageCircle } from 'lucide-react';
import { BRAND } from '@/config/brand';

export default function ArticleCTA() {
  return (
    <div className="mt-10 rounded-2xl border border-slate-200 dark:border-slate-700 bg-gradient-to-br from-slate-50 to-blue-50/30 dark:from-slate-800 dark:to-slate-800/60 p-6 sm:p-8 shadow-sm">
      {/* Opinion prompt */}
      <div className="flex items-start gap-3 mb-5">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/40 shrink-0">
          <MessageCircle size={20} className="text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">
            💬 Τι πιστεύεις;
          </h3>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Μοιράσου την άποψή σου με την κοινότητά μας. Η γνώμη σου μετράει!
          </p>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-slate-200 dark:bg-slate-700 mb-5" />

      {/* Facebook follow CTA */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            Ακολούθησέ μας στο Facebook
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Καθημερινή επικαιρότητα, σχολιασμός και συζητήσεις
          </p>
        </div>
        {BRAND.facebook && (
          <a
            href={BRAND.facebook}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2.5 bg-[#1877F2] hover:bg-[#166FE5] active:bg-[#1460C9] text-white text-sm font-bold px-5 py-2.5 rounded-full transition-colors shrink-0 shadow-sm"
          >
            <FacebookIcon size={16} />
            Ακολούθησε τη σελίδα
          </a>
        )}
      </div>
    </div>
  );
}
