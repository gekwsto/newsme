'use server';

import fs from 'fs';
import path from 'path';
import { auth } from '@/lib/auth';
import { publishToFacebook, maskToken } from '@/lib/facebook/publisher';

const TEST_MESSAGE = 'Δοκιμαστική δημοσίευση από το AiΣχολιασμός CMS.';
const GRAPH = 'https://graph.facebook.com/v25.0';

export type TokenInfo = {
  tokenType: string;
  name: string;
  id: string;
  permissions: string[];
  hasRequired: boolean;
};

export type FacebookTestResult =
  | { ok: true; postId: string }
  | { ok: false; error: string; tokenInfo?: TokenInfo };

export type FacebookDebugResult =
  | { ok: true; tokenInfo: TokenInfo }
  | { ok: false; error: string };

export type ExchangeResult =
  | { ok: true; masked: string }
  | { ok: false; error: string };

async function fetchTokenInfo(token: string, pageId: string): Promise<TokenInfo> {
  const meRes = await fetch(`${GRAPH}/me?fields=id,name&access_token=${token}`);
  const me = await meRes.json() as { id?: string; name?: string };

  const tokenId = me.id ?? 'unknown';
  const tokenName = me.name ?? 'unknown';
  const isPageToken = tokenId === pageId;

  const permRes = await fetch(`${GRAPH}/me/permissions?access_token=${token}`);
  const permData = await permRes.json() as { data?: { permission: string; status: string }[] };
  const permissions = (permData.data ?? [])
    .filter(p => p.status === 'granted')
    .map(p => p.permission);

  // Page tokens don't report scopes via /me/permissions (that's a User token concept).
  // If this IS the page token, treat permissions as satisfied — the actual API call will
  // tell us if something's wrong.
  const hasRequired = isPageToken
    ? true
    : permissions.includes('pages_read_engagement') &&
      permissions.includes('pages_manage_posts');

  return {
    tokenType: isPageToken ? 'PAGE' : 'USER',
    name: tokenName,
    id: tokenId,
    permissions,
    hasRequired,
  };
}

export async function debugFacebookToken(): Promise<FacebookDebugResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Δεν είσαι συνδεδεμένος' };

  const pageId = process.env.FACEBOOK_PAGE_ID;
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  if (!pageId || !token) return { ok: false, error: 'Λείπουν credentials' };

  try {
    const tokenInfo = await fetchTokenInfo(token, pageId);
    return { ok: true, tokenInfo };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Άγνωστο σφάλμα' };
  }
}

// Exchange user token → page token and save to .env.local automatically
export async function exchangeForPageToken(): Promise<ExchangeResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Δεν είσαι συνδεδεμένος' };

  const pageId = process.env.FACEBOOK_PAGE_ID;
  const userToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  if (!pageId || !userToken) return { ok: false, error: 'Λείπουν credentials' };

  // Fetch the Page Access Token using the User token
  const res = await fetch(`${GRAPH}/${pageId}?fields=access_token&access_token=${userToken}`);
  const data = await res.json() as { access_token?: string; error?: { message: string } };

  if (data.error || !data.access_token) {
    return { ok: false, error: data.error?.message ?? 'Δεν επιστράφηκε page token' };
  }

  const pageToken = data.access_token;

  // Update .env.local in place
  const envPath = path.join(process.cwd(), '.env.local');
  let content = fs.readFileSync(envPath, 'utf-8');
  content = content.replace(
    /^FACEBOOK_PAGE_ACCESS_TOKEN=.*$/m,
    `FACEBOOK_PAGE_ACCESS_TOKEN=${pageToken}`
  );
  fs.writeFileSync(envPath, content, 'utf-8');

  console.log(`[facebook] ✓ Page token saved to .env.local: ${maskToken(pageToken)}`);

  return { ok: true, masked: maskToken(pageToken) };
}

export async function testPublishToFacebook(): Promise<FacebookTestResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Δεν είσαι συνδεδεμένος' };
  if (session.user.role !== 'ADMIN') return { ok: false, error: 'Απαιτούνται δικαιώματα admin' };

  const pageId = process.env.FACEBOOK_PAGE_ID;
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  if (!pageId || !token) return { ok: false, error: 'Λείπουν credentials στο .env.local' };

  console.log(`[facebook-test] page=${pageId} token=${maskToken(token)}`);

  let tokenInfo: TokenInfo | undefined;
  try {
    tokenInfo = await fetchTokenInfo(token, pageId);
    if (tokenInfo.tokenType !== 'PAGE') {
      return {
        ok: false,
        error: `Χρησιμοποιείς User token. Πάτα "Μετατροπή σε Page Token" πρώτα.`,
        tokenInfo,
      };
    }
    // Page tokens don't expose permissions via /me/permissions — skip that check
    // and attempt publish directly.
  } catch { /* try publish anyway */ }

  try {
    const result = await publishToFacebook({ message: TEST_MESSAGE });
    console.log(`[facebook-test] ✓ published id=${result.id}`);
    return { ok: true, postId: result.id };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Άγνωστο σφάλμα';
    console.error(`[facebook-test] ✗ ${error}`);
    return { ok: false, error, tokenInfo };
  }
}
