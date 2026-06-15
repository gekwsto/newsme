import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Settings } from 'lucide-react';
import { auth } from '@/lib/auth';
import { getNewsAutomationSettings } from '@/actions/news-settings';
import AdminShell from '@/components/admin/AdminShell';
import NewsSettingsForm from './NewsSettingsForm';
import PipelineTrigger from './PipelineTrigger';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'News Automation | Admin ΑΙΣΧΟΛΙΑΣΜΟΣ',
};

export default async function NewsSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect('/admin/login');

  const settings = await getNewsAutomationSettings();

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

        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-2">Χειροκίνητη Εκτέλεση</h2>
          <p className="text-xs text-slate-400 mb-4">Τρέχει το pipeline αμέσως χωρίς να ελέγξει ώρα δημοσίευσης.</p>
          <PipelineTrigger />
        </div>

        <div className="bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3">Scheduler Endpoint</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
            Κάλεσε το παρακάτω endpoint από cron job (π.χ. κάθε ώρα):
          </p>
          <code className="text-xs bg-slate-100 dark:bg-slate-800 px-3 py-2 rounded-lg block font-mono text-slate-700 dark:text-slate-300">
            POST /api/scheduler/news-pipeline<br />
            Header: x-cron-secret: {'{CRON_SECRET}'}
          </code>
        </div>
      </div>
    </AdminShell>
  );
}
