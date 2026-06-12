'use client';

import { useState, useTransition } from 'react';
import {
  testPublishToFacebook,
  debugFacebookToken,
  exchangeForPageToken,
  type FacebookTestResult,
  type FacebookDebugResult,
  type ExchangeResult,
  type TokenInfo,
} from '@/actions/facebook-test';

const TEST_MESSAGE = 'Δοκιμαστική δημοσίευση από το AiΣχολιασμός CMS.';
const REQUIRED_PERMS = ['pages_read_engagement', 'pages_manage_posts'];

function TokenInfoPanel({ info }: { info: TokenInfo }) {
  return (
    <div className="mt-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs divide-y divide-gray-100 dark:divide-gray-800">
      <div className="px-3 py-2 flex items-center justify-between">
        <span className="text-gray-500">Token type</span>
        <span className={`font-semibold ${info.tokenType === 'PAGE' ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
          {info.tokenType === 'PAGE' ? '✓ Page Token' : '✗ User Token — χρειάζεσαι Page Token'}
        </span>
      </div>
      <div className="px-3 py-2 flex items-center justify-between">
        <span className="text-gray-500">Ανήκει σε</span>
        <span className="font-mono text-gray-700 dark:text-gray-300">{info.name} ({info.id})</span>
      </div>
      <div className="px-3 py-2">
        <p className="text-gray-500 mb-1.5">Permissions</p>
        <div className="flex flex-wrap gap-1.5">
          {REQUIRED_PERMS.map(p => {
            const granted = info.permissions.includes(p);
            return (
              <span key={p} className={`px-2 py-0.5 rounded font-mono ${granted ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'}`}>
                {granted ? '✓' : '✗'} {p}
              </span>
            );
          })}
          {info.permissions.filter(p => !REQUIRED_PERMS.includes(p)).map(p => (
            <span key={p} className="px-2 py-0.5 rounded font-mono bg-gray-100 dark:bg-gray-800 text-gray-500">
              {p}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function FacebookTestClient() {
  const [isDebugging, startDebugT] = useTransition();
  const [isExchanging, startExchangeT] = useTransition();
  const [isPublishing, startPublishT] = useTransition();
  const [debugResult, setDebugResult] = useState<FacebookDebugResult | null>(null);
  const [exchangeResult, setExchangeResult] = useState<ExchangeResult | null>(null);
  const [publishResult, setPublishResult] = useState<FacebookTestResult | null>(null);

  function handleDebug() {
    setDebugResult(null);
    setExchangeResult(null);
    startDebugT(async () => {
      const r = await debugFacebookToken();
      setDebugResult(r);
    });
  }

  function handleExchange() {
    setExchangeResult(null);
    startExchangeT(async () => {
      const r = await exchangeForPageToken();
      setExchangeResult(r);
    });
  }

  function handlePublish() {
    setPublishResult(null);
    startPublishT(async () => {
      const r = await testPublishToFacebook();
      setPublishResult(r);
    });
  }

  const busy = isDebugging || isExchanging || isPublishing;
  const isUserToken = debugResult?.ok && debugResult.tokenInfo.tokenType === 'USER';
  const tokenOk = debugResult?.ok && debugResult.tokenInfo.tokenType === 'PAGE' && debugResult.tokenInfo.hasRequired;

  return (
    <div className="max-w-lg space-y-6">
      {/* Test message preview */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4">
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
          Μήνυμα δοκιμής
        </p>
        <p className="text-sm text-gray-900 dark:text-white">{TEST_MESSAGE}</p>
      </div>

      {/* Step 1: Debug token */}
      <div>
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
          Βήμα 1 — Έλεγχος token
        </p>
        <button
          disabled={busy}
          onClick={handleDebug}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isDebugging ? (
            <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg> Έλεγχος…</>
          ) : '🔍 Έλεγξε το token'}
        </button>

        {debugResult && (
          <>
            {debugResult.ok ? (
              <>
                <div className={`mt-3 text-xs font-semibold px-3 py-2 rounded-lg ${tokenOk ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'}`}>
                  {tokenOk ? '✓ Token έτοιμο για publish' : '⚠ User Token — χρειάζεται μετατροπή σε Page Token'}
                </div>
                <TokenInfoPanel info={debugResult.tokenInfo} />

                {/* Auto-exchange button when user token detected */}
                {isUserToken && (
                  <div className="mt-4">
                    <button
                      disabled={busy}
                      onClick={handleExchange}
                      className="inline-flex items-center gap-2 rounded-lg bg-amber-500 hover:bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isExchanging ? (
                        <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg> Μετατροπή…</>
                      ) : '🔄 Μετατροπή σε Page Token (αυτόματο)'}
                    </button>

                    {exchangeResult && (
                      <div className={`mt-3 rounded-lg border p-3 text-xs ${exchangeResult.ok ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'}`}>
                        {exchangeResult.ok ? (
                          <>
                            <p className="font-semibold mb-1">✓ Page Token αποθηκεύτηκε στο .env.local</p>
                            <p className="font-mono">{exchangeResult.masked}</p>
                            <p className="mt-2 text-amber-600 dark:text-amber-400 font-medium">
                              ⚠ Κάνε restart τον dev server για να φορτωθεί το νέο token, μετά πάτα ξανά Test Publish.
                            </p>
                          </>
                        ) : (
                          <p>{exchangeResult.error}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <p className="mt-3 text-xs text-red-500">{debugResult.error}</p>
            )}
          </>
        )}
      </div>

      {/* Step 2: Publish */}
      <div>
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
          Βήμα 2 — Δοκιμαστικό publish
        </p>
        <button
          disabled={busy}
          onClick={handlePublish}
          className="inline-flex items-center gap-2.5 rounded-lg bg-[#1877F2] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1560cc] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {isPublishing ? (
            <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg> Δημοσίευση…</>
          ) : (
            <><svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.874v2.25h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg> Test Publish to Facebook</>
          )}
        </button>

        {publishResult && (
          <div className={`mt-4 rounded-lg border p-4 ${publishResult.ok ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20' : 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20'}`}>
            {publishResult.ok ? (
              <>
                <p className="text-sm font-semibold text-green-700 dark:text-green-400 mb-1">✓ Δημοσιεύτηκε επιτυχώς!</p>
                <p className="text-xs text-green-600 dark:text-green-500">
                  Facebook Post ID:{' '}
                  <span className="font-mono bg-green-100 dark:bg-green-900/40 px-1.5 py-0.5 rounded">{publishResult.postId}</span>
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-red-700 dark:text-red-400 mb-1">✗ Αποτυχία</p>
                <p className="text-xs text-red-600 dark:text-red-400 break-words">{publishResult.error}</p>
                {'tokenInfo' in publishResult && publishResult.tokenInfo && (
                  <TokenInfoPanel info={publishResult.tokenInfo} />
                )}
              </>
            )}
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-500">
        Αυτό το εργαλείο δεν αγγίζει τη βάση δεδομένων — δοκιμάζει μόνο το Facebook Graph API.
      </p>
    </div>
  );
}
