import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import AdminShell from '@/components/admin/AdminShell';
import { TrainingDataType } from '@/generated/prisma/enums';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Training Data | Admin ΑΙΣΧΟΛΙΑΣΜΟΣ',
};

const TYPE_LABEL: Record<TrainingDataType, string> = {
  NEWS_RSS: 'RSS News',
  NEWS_MANUAL: 'Manual',
  EVERGREEN: 'Evergreen',
};

const TYPE_COLOR: Record<TrainingDataType, string> = {
  NEWS_RSS: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  NEWS_MANUAL: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  EVERGREEN: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
};

async function fetchStats() {
  const [
    total,
    published,
    rejected,
    edited,
    byType,
    recent,
  ] = await Promise.all([
    prisma.trainingExample.count(),
    prisma.trainingExample.count({ where: { wasPublished: true } }),
    prisma.trainingExample.count({ where: { wasRejected: true } }),
    prisma.trainingExample.count({ where: { wasEdited: true } }),
    prisma.trainingExample.groupBy({
      by: ['dataType'],
      _count: { id: true },
    }),
    prisma.trainingExample.findMany({
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        id: true,
        dataType: true,
        generatedTitle: true,
        category: true,
        wasPublished: true,
        wasRejected: true,
        wasEdited: true,
        model: true,
        sourceName: true,
        createdAt: true,
        includeInExport: true,
      },
    }),
  ]);

  const pending = total - published - rejected;
  const editRate = published > 0 ? Math.round((edited / published) * 100) : 0;
  const publishRate = total > 0 ? Math.round((published / total) * 100) : 0;

  const typeMap = Object.fromEntries(byType.map((b) => [b.dataType, b._count.id])) as Record<string, number>;

  return { total, published, rejected, pending, edited, editRate, publishRate, typeMap, recent };
}

export default async function TrainingDataPage() {
  const session = await auth();
  if (!session?.user) redirect('/admin/login');

  const stats = await fetchStats();

  return (
    <AdminShell user={{ name: session.user.name!, email: session.user.email!, role: session.user.role }}>
      <div className="max-w-5xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              🎓 Training Data
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Αυτόματη συλλογή prompt/completion pairs για future fine-tuning (Qwen / Llama / LoRA).
            </p>
          </div>
          <div className="flex gap-2">
            <a
              href="/api/admin/training-data/export?format=openai&quality=published"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
            >
              ↓ OpenAI JSONL
            </a>
            <a
              href="/api/admin/training-data/export?format=sharegpt&quality=published"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-600 text-white hover:bg-violet-700 transition-colors"
            >
              ↓ ShareGPT
            </a>
            <a
              href="/api/admin/training-data/export?format=alpaca&quality=published"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              ↓ Alpaca
            </a>
          </div>
        </div>

        {/* Stats overview */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
            Στατιστικά
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
              <p className="text-xs text-slate-500">Σύνολο</p>
              <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{stats.total}</p>
              <p className="text-xs text-slate-400 mt-0.5">training examples</p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
              <p className="text-xs text-slate-500">Δημοσιευμένα</p>
              <p className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">{stats.published}</p>
              <p className="text-xs text-slate-400 mt-0.5">{stats.publishRate}% publish rate</p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
              <p className="text-xs text-slate-500">Σε αναμονή</p>
              <p className="mt-1 text-2xl font-bold text-amber-500">{stats.pending}</p>
              <p className="text-xs text-slate-400 mt-0.5">pending review</p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
              <p className="text-xs text-slate-500">Απορριφθέντα</p>
              <p className="mt-1 text-2xl font-bold text-red-500">{stats.rejected}</p>
              <p className="text-xs text-slate-400 mt-0.5">negative signal</p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
              <p className="text-xs text-slate-500">Επεξεργάστηκαν</p>
              <p className="mt-1 text-2xl font-bold text-blue-500">{stats.edited}</p>
              <p className="text-xs text-slate-400 mt-0.5">{stats.editRate}% edit rate</p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
              <p className="text-xs text-slate-500">Export-ready</p>
              <p className="mt-1 text-2xl font-bold text-violet-600 dark:text-violet-400">{stats.published}</p>
              <p className="text-xs text-slate-400 mt-0.5">published examples</p>
            </div>
          </div>
        </section>

        {/* By type */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
            Ανά τύπο
          </h2>
          <div className="flex flex-wrap gap-3">
            {Object.entries(TYPE_LABEL).map(([type, label]) => {
              const count = stats.typeMap[type] ?? 0;
              return (
                <div
                  key={type}
                  className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-3 flex items-center gap-3"
                >
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TYPE_COLOR[type as TrainingDataType]}`}>
                    {label}
                  </span>
                  <span className="text-xl font-bold text-slate-900 dark:text-white">{count}</span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Export guide */}
        <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-5">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">📤 Formats εξαγωγής</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-slate-600 dark:text-slate-400">
            <div>
              <p className="font-bold text-slate-800 dark:text-slate-200 mb-1">OpenAI JSONL</p>
              <p>Για OpenAI fine-tuning API. Μορφή: <code className="font-mono text-violet-500">{`{"messages":[...]}`}</code> ανά γραμμή. Φόρτωσε στο <code>openai.FineTuning.jobs.create()</code>.</p>
            </div>
            <div>
              <p className="font-bold text-slate-800 dark:text-slate-200 mb-1">ShareGPT / Axolotl</p>
              <p>Για τοπικό fine-tuning με Axolotl/LLaMA-Factory. Μορφή: <code className="font-mono text-violet-500">{`{"conversations":[...]}`}</code>. Δουλεύει με Qwen, Llama 3, Mistral.</p>
            </div>
            <div>
              <p className="font-bold text-slate-800 dark:text-slate-200 mb-1">Alpaca</p>
              <p>Κλασικό format για LoRA training. Μορφή: <code className="font-mono text-violet-500">{`{"instruction","input","output"}`}</code>. Συμβατό με Stanford Alpaca, unsloth.</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-400">
            Query params: <code className="font-mono">?quality=all</code> (όλα), <code className="font-mono">?quality=published</code> (μόνο δημοσιευμένα — <strong>συνιστάται</strong>), <code className="font-mono">?quality=published_clean</code> (δημοσιευμένα χωρίς επεξεργασία — υψηλότερη ποιότητα).
          </p>
        </section>

        {/* Recent examples */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
            Πρόσφατα ({stats.recent.length})
          </h2>
          {stats.recent.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-sm text-slate-400">
              Δεν υπάρχουν training examples ακόμη. Θα συλλέγονται αυτόματα από κάθε νέα δημιουργία άρθρου.
            </div>
          ) : (
            <div className="space-y-2">
              {stats.recent.map((ex) => (
                <div
                  key={ex.id}
                  className="flex items-start gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3"
                >
                  {/* Type badge */}
                  <span className={`mt-0.5 shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${TYPE_COLOR[ex.dataType]}`}>
                    {TYPE_LABEL[ex.dataType]}
                  </span>

                  {/* Title + meta */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{ex.generatedTitle}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {ex.sourceName && <span className="mr-2">{ex.sourceName}</span>}
                      {ex.category && <span className="mr-2 text-violet-500">{ex.category}</span>}
                      <span className="font-mono">{ex.model}</span>
                      <span className="mx-1.5">·</span>
                      {new Date(ex.createdAt).toLocaleDateString('el-GR')}
                    </p>
                  </div>

                  {/* Status badges */}
                  <div className="flex items-center gap-1 shrink-0">
                    {ex.wasPublished && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                        ✓ published
                      </span>
                    )}
                    {ex.wasRejected && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                        ✕ rejected
                      </span>
                    )}
                    {ex.wasEdited && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                        ✎ edited
                      </span>
                    )}
                    {!ex.wasPublished && !ex.wasRejected && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        pending
                      </span>
                    )}
                    {!ex.includeInExport && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-400 dark:bg-slate-700 dark:text-slate-500">
                        excluded
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Pipeline explanation */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
            Τι αποθηκεύεται
          </h2>
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 space-y-3 text-sm text-slate-600 dark:text-slate-300">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <p className="font-semibold text-slate-800 dark:text-slate-200">Per generation:</p>
                <ul className="space-y-1 text-xs text-slate-500">
                  <li>• <strong>sourceTitle / sourceExcerpt</strong> — το αρχικό RSS άρθρο</li>
                  <li>• <strong>systemPrompt</strong> — το πλήρες editorial system prompt</li>
                  <li>• <strong>userPrompt</strong> — το user message (topic + context)</li>
                  <li>• <strong>aiCompletion</strong> — το πλήρες JSON response του GPT</li>
                  <li>• <strong>model</strong> — το μοντέλο που χρησιμοποιήθηκε</li>
                  <li>• <strong>generatedTitle / generatedTags / category</strong></li>
                </ul>
              </div>
              <div className="space-y-2">
                <p className="font-semibold text-slate-800 dark:text-slate-200">Per human action:</p>
                <ul className="space-y-1 text-xs text-slate-500">
                  <li>• <strong>wasPublished</strong> → θετικό signal</li>
                  <li>• <strong>wasRejected</strong> → αρνητικό signal (DPO training)</li>
                  <li>• <strong>wasEdited</strong> → ο άνθρωπος διόρθωσε το AI output</li>
                  <li>• <strong>finalTitle / finalContent</strong> — η τελική δημοσιευμένη έκδοση</li>
                </ul>
              </div>
            </div>
            <p className="text-xs text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
              Τα δεδομένα συλλέγονται από:{' '}
              <Link href="/admin/ai-generator" className="text-violet-500 hover:underline">AI Generator</Link>,{' '}
              <Link href="/admin/news-discovery" className="text-violet-500 hover:underline">News Discovery</Link>,{' '}
              και αυτόματα μέσω Auto Pipeline.
            </p>
          </div>
        </section>
      </div>
    </AdminShell>
  );
}
