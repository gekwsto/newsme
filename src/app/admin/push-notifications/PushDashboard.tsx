'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Bell,
  Send,
  TestTube2,
  RefreshCw,
  Users,
  Loader2,
  CheckCircle,
  XCircle,
  Smartphone,
  Monitor,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface StatsData {
  activeSubscribers: number;
  inactiveSubscribers: number;
  totalCampaigns: number;
  totalSent: number;
  totalFailed: number;
  totalClicks: number;
  ctr: number;
}

interface Campaign {
  id: string;
  title: string;
  status: string;
  totalTargeted: number;
  sentCount: number;
  failedCount: number;
  clickedCount: number;
  articleId: string | null;
  createdAt: string;
  completedAt: string | null;
}

interface Subscription {
  id: string;
  platform: string | null;
  deviceType: string | null;
  isTestDevice: boolean;
  failureCount: number;
  lastSuccessAt: string | null;
  createdAt: string;
}

const statusColors: Record<string, string> = {
  COMPLETED: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
  PROCESSING: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
  PARTIALLY_FAILED: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
  FAILED: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
  DRAFT: 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400',
};

const inputClass =
  'w-full bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 transition-colors placeholder-slate-400';
const labelClass =
  'block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5';

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color ?? 'text-slate-900 dark:text-slate-100'}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function NotificationPreview({
  title,
  body,
  imageUrl,
}: {
  title: string;
  body: string;
  imageUrl?: string;
}) {
  return (
    <div className="bg-slate-100 dark:bg-slate-700/60 rounded-xl p-4 border border-slate-200 dark:border-slate-600">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
        Preview (indicative)
      </p>
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-3 flex gap-3">
        <div className="w-10 h-10 rounded bg-red-600 shrink-0 flex items-center justify-center text-white text-xs font-bold">
          N
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
            {title || 'Τίτλος ειδοποίησης'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5">
            {body || 'Κείμενο ειδοποίησης...'}
          </p>
          <p className="text-[10px] text-slate-400 mt-1">newsme.gr</p>
        </div>
        {imageUrl && (
          <div
            className="w-12 h-12 rounded overflow-hidden shrink-0 bg-slate-200 dark:bg-slate-600 bg-cover bg-center"
            style={{ backgroundImage: `url(${imageUrl})` }}
            role="img"
            aria-label="notification image preview"
          />
        )}
      </div>
    </div>
  );
}

export default function PushDashboard() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSubs, setShowSubs] = useState(false);

  // Test form
  const [testTitle, setTestTitle] = useState('Test — Newsme.gr');
  const [testBody, setTestBody] = useState('Αυτή είναι μια δοκιμαστική ειδοποίηση.');
  const [testUrl, setTestUrl] = useState('/');
  const [testImageUrl, setTestImageUrl] = useState('');
  const [selectedTestSubId, setSelectedTestSubId] = useState('');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testLoading, setTestLoading] = useState(false);

  // Article push form
  const [articleId, setArticleId] = useState('');
  const [articleTitle, setArticleTitle] = useState('');
  const [articleBody, setArticleBody] = useState('');
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [sendLoading, setSendLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, campaignsRes, subsRes] = await Promise.all([
        fetch('/api/admin/push/stats').then((r) => r.json()),
        fetch('/api/admin/push/campaigns').then((r) => r.json()),
        fetch('/api/admin/push/subscriptions').then((r) => r.json()),
      ]);
      if (statsRes) setStats(statsRes);
      if (campaignsRes?.campaigns) setCampaigns(campaignsRes.campaigns);
      if (subsRes?.subscriptions) setSubs(subsRes.subscriptions);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  const handleTest = async () => {
    setTestLoading(true);
    setTestResult(null);
    try {
      const payload: Record<string, unknown> = {
        title: testTitle,
        body: testBody,
        url: testUrl || '/',
      };
      if (testImageUrl) payload.imageUrl = testImageUrl;
      if (selectedTestSubId) payload.subscriptionId = selectedTestSubId;

      const res = await fetch('/api/admin/push/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json() as { ok: boolean; sent?: number; total?: number; error?: string };
      if (data.ok) {
        setTestResult(`Εστάλη σε ${data.sent}/${data.total} συσκευές.`);
      } else {
        setTestResult(`Σφάλμα: ${data.error ?? 'Άγνωστο'}`);
      }
    } catch {
      setTestResult('Σφάλμα δικτύου.');
    } finally {
      setTestLoading(false);
    }
  };

  const handleSendArticle = async () => {
    if (!articleId.trim()) return;
    setSendLoading(true);
    setSendResult(null);
    try {
      const payload: Record<string, unknown> = { articleId: articleId.trim() };
      if (articleTitle) payload.title = articleTitle;
      if (articleBody) payload.body = articleBody;

      const res = await fetch('/api/admin/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json() as { ok: boolean; sentCount?: number; failedCount?: number; totalTargeted?: number; error?: string };
      if (data.ok) {
        setSendResult(
          `Campaign ολοκληρώθηκε: ${data.sentCount}/${data.totalTargeted} εστάλησαν${data.failedCount ? `, ${data.failedCount} απέτυχαν` : ''}.`,
        );
        await loadData();
      } else {
        setSendResult(`Σφάλμα: ${data.error ?? 'Άγνωστο'}`);
      }
    } catch {
      setSendResult('Σφάλμα δικτύου.');
    } finally {
      setSendLoading(false);
    }
  };

  const handleMarkTestDevice = async (id: string, isTestDevice: boolean) => {
    await fetch('/api/admin/push/subscriptions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscriptionId: id, isTestDevice }),
    });
    setSubs((prev) =>
      prev.map((s) => (s.id === id ? { ...s, isTestDevice } : s)),
    );
  };

  const testSubs = subs.filter((s) => s.isTestDevice);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Bell size={22} className="text-red-500" />
            Push Notifications
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Διαχείριση web push ειδοποιήσεων
          </p>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-1.5 text-sm font-medium text-slate-500 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Ανανέωση
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <StatCard
            label="Ενεργοί Subscribers"
            value={stats.activeSubscribers}
            color="text-emerald-600 dark:text-emerald-400"
          />
          <StatCard
            label="Ανενεργοί"
            value={stats.inactiveSubscribers}
            color="text-slate-400"
          />
          <StatCard label="Campaigns" value={stats.totalCampaigns} />
          <StatCard
            label="Συνολικές Αποστολές"
            value={stats.totalSent.toLocaleString('el-GR')}
          />
          <StatCard
            label="Αποτυχίες"
            value={stats.totalFailed}
            color={stats.totalFailed > 0 ? 'text-red-500' : undefined}
          />
          <StatCard
            label="Clicks"
            value={stats.totalClicks}
            color="text-blue-600 dark:text-blue-400"
          />
          <StatCard
            label="CTR"
            value={`${stats.ctr}%`}
            sub="clicks / sent"
            color="text-violet-600 dark:text-violet-400"
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Test notification */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-4">
          <h2 className="text-sm font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest flex items-center gap-2">
            <TestTube2 size={15} className="text-amber-500" />
            Δοκιμαστική Ειδοποίηση
          </h2>

          <div>
            <label className={labelClass}>Τίτλος</label>
            <input
              value={testTitle}
              onChange={(e) => setTestTitle(e.target.value)}
              className={inputClass}
              maxLength={100}
            />
          </div>
          <div>
            <label className={labelClass}>Κείμενο</label>
            <textarea
              value={testBody}
              onChange={(e) => setTestBody(e.target.value)}
              rows={2}
              className={`${inputClass} resize-none`}
              maxLength={200}
            />
          </div>
          <div>
            <label className={labelClass}>URL</label>
            <input
              value={testUrl}
              onChange={(e) => setTestUrl(e.target.value)}
              className={inputClass}
              placeholder="/"
            />
          </div>
          <div>
            <label className={labelClass}>Image URL (προαιρετικό)</label>
            <input
              value={testImageUrl}
              onChange={(e) => setTestImageUrl(e.target.value)}
              className={inputClass}
              placeholder="https://..."
            />
          </div>

          {subs.length > 0 && (
            <div>
              <label className={labelClass}>Συσκευή (κενό = όλες test)</label>
              <select
                value={selectedTestSubId}
                onChange={(e) => setSelectedTestSubId(e.target.value)}
                className={inputClass}
              >
                <option value="">Όλες test συσκευές</option>
                {subs.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.platform ?? 'Unknown'} · {s.deviceType ?? 'unknown'}{s.isTestDevice ? ' ★' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <NotificationPreview title={testTitle} body={testBody} imageUrl={testImageUrl || undefined} />

          {testSubs.length === 0 && !selectedTestSubId && (
            <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2">
              Δεν υπάρχουν test συσκευές. Σήμανε μια subscription ως test device παρακάτω.
            </p>
          )}

          <button
            onClick={handleTest}
            disabled={testLoading || (testSubs.length === 0 && !selectedTestSubId)}
            className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            {testLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Αποστολή Test
          </button>

          {testResult && (
            <p className={`text-xs p-2 rounded-lg ${testResult.startsWith('Σφάλμα') ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400' : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'}`}>
              {testResult}
            </p>
          )}
        </div>

        {/* Article push */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-4">
          <h2 className="text-sm font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest flex items-center gap-2">
            <Send size={15} className="text-red-500" />
            Αποστολή για Άρθρο
          </h2>

          <div>
            <label className={labelClass}>Article ID</label>
            <input
              value={articleId}
              onChange={(e) => setArticleId(e.target.value)}
              className={inputClass}
              placeholder="cuid του άρθρου"
            />
          </div>
          <div>
            <label className={labelClass}>Τίτλος (κενό = από άρθρο)</label>
            <input
              value={articleTitle}
              onChange={(e) => setArticleTitle(e.target.value)}
              className={inputClass}
              maxLength={100}
              placeholder="Override τίτλου (προαιρετικό)"
            />
          </div>
          <div>
            <label className={labelClass}>Κείμενο (κενό = excerpt άρθρου)</label>
            <textarea
              value={articleBody}
              onChange={(e) => setArticleBody(e.target.value)}
              rows={2}
              className={`${inputClass} resize-none`}
              maxLength={200}
              placeholder="Override body (προαιρετικό)"
            />
          </div>

          <button
            type="button"
            onClick={() => setShowPreview((p) => !p)}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
          >
            {showPreview ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {showPreview ? 'Απόκρυψη' : 'Εμφάνιση'} preview
          </button>

          {showPreview && (
            <NotificationPreview
              title={articleTitle || 'Τίτλος άρθρου'}
              body={articleBody || 'Excerpt άρθρου...'}
            />
          )}

          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
            <p className="text-xs text-blue-700 dark:text-blue-400">
              <strong>{stats?.activeSubscribers ?? '—'}</strong> ενεργοί subscribers θα λάβουν αυτή την ειδοποίηση.
            </p>
          </div>

          <button
            onClick={handleSendArticle}
            disabled={sendLoading || !articleId.trim()}
            className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            {sendLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Αποστολή σε {stats?.activeSubscribers ?? '—'} subscribers
          </button>

          {sendResult && (
            <p className={`text-xs p-2 rounded-lg ${sendResult.startsWith('Σφάλμα') ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400' : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'}`}>
              {sendResult}
            </p>
          )}
        </div>
      </div>

      {/* Recent campaigns */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="text-sm font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest">
            Πρόσφατες Campaigns
          </h2>
        </div>

        {campaigns.length === 0 ? (
          <p className="p-6 text-sm text-slate-400">Δεν υπάρχουν campaigns ακόμα.</p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {campaigns.map((c) => {
              const ctr =
                c.sentCount > 0
                  ? ((c.clickedCount / c.sentCount) * 100).toFixed(1)
                  : '0.0';
              return (
                <div key={c.id} className="px-5 py-3">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${statusColors[c.status] ?? statusColors.DRAFT}`}
                        >
                          {c.status}
                        </span>
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                          {c.title}
                        </p>
                      </div>
                      <p className="text-xs text-slate-400">
                        {new Date(c.createdAt).toLocaleDateString('el-GR', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 shrink-0">
                      <span className="flex items-center gap-1">
                        <Users size={11} />
                        {c.totalTargeted}
                      </span>
                      <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                        <CheckCircle size={11} />
                        {c.sentCount}
                      </span>
                      {c.failedCount > 0 && (
                        <span className="flex items-center gap-1 text-red-500">
                          <XCircle size={11} />
                          {c.failedCount}
                        </span>
                      )}
                      <span className="text-blue-600 dark:text-blue-400">
                        {c.clickedCount} clicks ({ctr}%)
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Subscriptions / Device Management */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <button
          onClick={() => setShowSubs((p) => !p)}
          className="w-full flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors"
        >
          <h2 className="text-sm font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest flex items-center gap-2">
            <Smartphone size={13} />
            Devices ({subs.length})
          </h2>
          {showSubs ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
        </button>

        {showSubs && (
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {subs.length === 0 ? (
              <p className="p-6 text-sm text-slate-400">Δεν υπάρχουν ενεργές συνδρομές.</p>
            ) : (
              subs.map((s) => (
                <div key={s.id} className="px-5 py-3 flex items-center gap-3">
                  <div className="shrink-0 text-slate-400">
                    {s.deviceType === 'mobile' ? (
                      <Smartphone size={16} />
                    ) : (
                      <Monitor size={16} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      {s.platform ?? 'Unknown'} · {s.deviceType ?? 'unknown'}
                      {s.isTestDevice && (
                        <span className="ml-2 text-[10px] font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded-full">
                          TEST
                        </span>
                      )}
                    </p>
                    <p className="text-[10px] text-slate-400 font-mono">
                      {s.id.slice(0, 16)}…
                    </p>
                    {s.failureCount > 0 && (
                      <p className="text-[10px] text-red-400">{s.failureCount} αποτυχίες</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleMarkTestDevice(s.id, !s.isTestDevice)}
                    className={`text-xs px-2 py-1 rounded-lg border transition-colors ${
                      s.isTestDevice
                        ? 'border-amber-300 text-amber-600 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400'
                        : 'border-slate-200 text-slate-400 hover:border-slate-300 dark:border-slate-600'
                    }`}
                  >
                    {s.isTestDevice ? '★ Test' : 'Ορισμός Test'}
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* VAPID info */}
      <div className="bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
          Πληροφορίες VAPID
        </p>
        <p className="text-xs text-slate-400 font-mono">
          Public Key:{' '}
          {process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
            ? `${process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY.slice(0, 20)}…`
            : <span className="text-red-400">ΔΕΝ ΕΧΕΙ ΟΡΙΣΤΕΙ</span>}
        </p>
        <p className="text-xs text-slate-400 mt-1">
          Για να δημιουργήσεις keys:{' '}
          <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">
            npx web-push generate-vapid-keys
          </code>
        </p>
      </div>
    </div>
  );
}
