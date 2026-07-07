import type { Metadata } from 'next';
import { BRAND } from '@/config/brand';
import { redirect } from 'next/navigation';
import { Settings } from 'lucide-react';
import { auth } from '@/lib/auth';
import { getNewsAutomationSettings } from '@/actions/news-settings';
import { getEvergreenAutomationSettings } from '@/actions/evergreen-settings';
import AdminShell from '@/components/admin/AdminShell';
import NewsSettingsForm from './NewsSettingsForm';
import EvergreenSettingsForm from './EvergreenSettingsForm';
import PipelineTrigger from './PipelineTrigger';
import PipelineLastRun from './PipelineLastRun';
import EvergreenPipelineTrigger from './EvergreenPipelineTrigger';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: `News Automation | Admin ${BRAND.name}`,
};

export default async function NewsSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect('/admin/login');

  const [settings, evergreenSettings] = await Promise.all([
    getNewsAutomationSettings(),
    getEvergreenAutomationSettings(),
  ]);

  return (
    <AdminShell user={{ name: session.user.name!, email: session.user.email!, role: session.user.role }}>
      <div className="space-y-8 max-w-3xl">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Settings size={22} className="text-slate-400" />
            News Automation Settings
          </h1>
          <p className="text-slate-400 text-sm mt-1">Ρυθμίσεις αυτόματου pipeline ειδήσεων</p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-5">Ρυθμίσεις</h2>
          <NewsSettingsForm settings={settings} />
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm space-y-5">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-1">Τελευταίο Pipeline Run</h2>
            <PipelineLastRun />
          </div>
          <div className="border-t border-slate-100 dark:border-slate-700 pt-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-2">Χειροκίνητη Εκτέλεση</h2>
            <p className="text-xs text-slate-400 mb-4">Τρέχει το pipeline αμέσως χωρίς να ελέγξει ώρα δημοσίευσης.</p>
            <PipelineTrigger />
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-4">
          <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300">Production Cron Setup (self-hosted)</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Αν δεν χρησιμοποιείς Vercel, πρόσθεσε αυτά στο <code className="font-mono bg-slate-200 dark:bg-slate-700 px-1 rounded">crontab -e</code> του server:
          </p>
          <pre className="text-xs bg-slate-100 dark:bg-slate-800 px-4 py-3 rounded-lg font-mono text-slate-700 dark:text-slate-300 overflow-x-auto whitespace-pre">{
`# News pipeline — κάθε 30 λεπτά
*/30 * * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://newsme.gr/api/scheduler/news-pipeline >> /var/log/newsme-pipeline.log 2>&1

# Social post scheduler — κάθε λεπτό
* * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://newsme.gr/api/scheduler/run >> /var/log/newsme-scheduler.log 2>&1

# Evergreen pipeline — κάθε ώρα
0 * * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://newsme.gr/api/scheduler/evergreen-pipeline >> /var/log/newsme-evergreen.log 2>&1`
          }</pre>
          <p className="text-xs text-slate-400">
            Το <code className="font-mono bg-slate-200 dark:bg-slate-700 px-1 rounded">$CRON_SECRET</code> πρέπει να οριστεί στο περιβάλλον του cron user ή inline.
          </p>
          <div className="border-t border-slate-200 dark:border-slate-700 pt-3">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Manual test (από terminal):</p>
            <code className="text-xs bg-slate-100 dark:bg-slate-800 px-3 py-2 rounded-lg block font-mono text-slate-700 dark:text-slate-300 break-all">
              curl -fsS -X POST -H &quot;Authorization: Bearer YOUR_SECRET&quot; https://newsme.gr/api/scheduler/news-pipeline
            </code>
          </div>
        </div>

        {/* ── Evergreen Pipeline Settings ─────────────────────────────────── */}
        <div className="border-t border-slate-200 dark:border-slate-700 pt-8">
          <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
            🌿 Evergreen Automation Settings
          </h1>
          <p className="text-slate-400 text-sm mt-1">Αυτόματη παραγωγή evergreen άρθρων σε ξεχωριστές ώρες</p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-5">Ρυθμίσεις</h2>
          <EvergreenSettingsForm settings={evergreenSettings} />
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-2">Χειροκίνητη Εκτέλεση Evergreen</h2>
          <p className="text-xs text-slate-400 mb-4">Τρέχει το evergreen pipeline αμέσως (παρακάμπτει έλεγχο ώρας).</p>
          <EvergreenPipelineTrigger />
        </div>
      </div>
    </AdminShell>
  );
}
