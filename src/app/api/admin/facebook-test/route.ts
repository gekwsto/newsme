import { auth } from '@/lib/auth';

export const runtime = 'nodejs';

const GRAPH = 'https://graph.facebook.com/v25.0';

function maskToken(t: string): string {
  if (t.length <= 12) return '***';
  return `${t.slice(0, 6)}...${t.slice(-4)}`;
}

type GraphMeResponse = {
  id?: string;
  name?: string;
  category?: string;
  error?: { message: string; type: string; code: number; error_subcode?: number };
};

type DebugTokenResponse = {
  data?: {
    app_id?: string;
    type?: string;
    is_valid?: boolean;
    expires_at?: number;
    issued_at?: number;
    scopes?: string[];
    error?: { code: number; message: string };
  };
  error?: { message: string; code: number };
};

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  const pageId = process.env.FACEBOOK_PAGE_ID;
  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;

  // ── 1. Env diagnostics (no token value) ──────────────────────────────────
  const envCheck = {
    FACEBOOK_PAGE_ACCESS_TOKEN: {
      present: Boolean(token),
      length: token?.length ?? 0,
      masked: token ? maskToken(token) : null,
    },
    FACEBOOK_PAGE_ID: {
      present: Boolean(pageId),
      value: pageId ?? null,
    },
    FACEBOOK_APP_ID: { present: Boolean(appId) },
    FACEBOOK_APP_SECRET: { present: Boolean(appSecret) },
  };

  console.log('[facebook] facebook_token_loaded', {
    facebook_token_loaded: Boolean(token),
    facebook_token_length: token?.length ?? 0,
    facebook_page_id: pageId ?? null,
  });

  if (!token) {
    return Response.json({
      ok: false,
      tokenValid: false,
      error: 'FACEBOOK_PAGE_ACCESS_TOKEN is not set in environment',
      env: envCheck,
    });
  }

  // ── 2. Call /me to validate token and get page identity ──────────────────
  let meData: GraphMeResponse = {};
  let meStatus = 0;
  try {
    const res = await fetch(
      `${GRAPH}/me?fields=id,name,category&access_token=${token}`,
      { signal: AbortSignal.timeout(8000) }
    );
    meStatus = res.status;
    meData = await res.json() as GraphMeResponse;
  } catch (err) {
    return Response.json({
      ok: false,
      tokenValid: false,
      error: `Network error calling Graph API: ${err instanceof Error ? err.message : String(err)}`,
      env: envCheck,
    });
  }

  if (meData.error) {
    const code = meData.error.code;
    const subcode = meData.error.error_subcode;
    let tokenStatus = 'invalid';
    if (code === 190) {
      if (subcode === 463 || subcode === 467) tokenStatus = 'expired';
      else if (subcode === 460) tokenStatus = 'password_changed';
      else tokenStatus = 'expired_or_invalid';
    }
    return Response.json({
      ok: false,
      tokenValid: false,
      tokenStatus,
      graphHttpStatus: meStatus,
      error: meData.error.message,
      errorCode: code,
      errorSubcode: subcode,
      env: envCheck,
      hint: code === 190
        ? 'Token is expired or revoked. Generate a new Page Access Token from Meta Business Suite → Settings → Advanced → Page Access Tokens.'
        : 'Unexpected API error — check token permissions.',
    });
  }

  const pageIdFromToken = meData.id;
  const pageName = meData.name;
  const pageCategory = meData.category;
  const pageIdMatches = pageId ? pageIdFromToken === pageId : null;

  // ── 3. Try debug_token for expiry info (requires APP_ID + APP_SECRET) ────
  let expiresAt: string | null = null;
  let issuedAt: string | null = null;
  let tokenType: string | null = null;
  let scopes: string[] | null = null;
  let debugTokenError: string | null = null;

  if (appId && appSecret) {
    try {
      const debugRes = await fetch(
        `${GRAPH}/debug_token?input_token=${token}&access_token=${appId}|${appSecret}`,
        { signal: AbortSignal.timeout(8000) }
      );
      const debugData = await debugRes.json() as DebugTokenResponse;
      if (debugData.data && !debugData.data.error) {
        const d = debugData.data;
        expiresAt = d.expires_at
          ? (d.expires_at === 0 ? 'never (permanent token)' : new Date(d.expires_at * 1000).toISOString())
          : null;
        issuedAt = d.issued_at ? new Date(d.issued_at * 1000).toISOString() : null;
        tokenType = d.type ?? null;
        scopes = d.scopes ?? null;
      } else {
        debugTokenError = debugData.data?.error?.message ?? debugData.error?.message ?? 'debug_token call failed';
      }
    } catch (err) {
      debugTokenError = `debug_token network error: ${err instanceof Error ? err.message : String(err)}`;
    }
  } else {
    debugTokenError = 'FACEBOOK_APP_ID / FACEBOOK_APP_SECRET not set — cannot check expiry';
  }

  return Response.json({
    ok: true,
    tokenValid: true,
    tokenStatus: 'valid',
    graphHttpStatus: meStatus,

    page: {
      id: pageIdFromToken,
      name: pageName,
      category: pageCategory ?? null,
      idMatchesEnv: pageIdMatches,
    },

    tokenDetail: {
      type: tokenType,
      expiresAt,
      issuedAt,
      scopes,
      debugTokenError,
    },

    env: envCheck,
  });
}
