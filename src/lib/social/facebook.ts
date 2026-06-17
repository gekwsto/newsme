import type { PlatformClient, PostPayload, PostResult, PostInsights } from './platforms';

const GRAPH = 'https://graph.facebook.com/v25.0';

function maskToken(token: string): string {
  if (token.length <= 10) return '***';
  return `${token.slice(0, 6)}...${token.slice(-4)}`;
}

function getCredentials() {
  const pageId = process.env.FACEBOOK_PAGE_ID;
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  console.log('[facebook] facebook_token_loaded', {
    facebook_token_loaded: Boolean(token),
    facebook_token_length: token?.length ?? 0,
    facebook_page_id: pageId ?? null,
  });
  if (!pageId || !token) throw new Error('Facebook credentials not configured');
  return { pageId, token };
}

export const FacebookClient: PlatformClient = {
  async publish(payload: PostPayload): Promise<PostResult> {
    const { pageId, token } = getCredentials();
    try {
      const bodyObj: Record<string, string> = {
        message: payload.content,
        access_token: token,
      };
      if (payload.link) bodyObj.link = payload.link;

      console.log('[facebook] FACEBOOK POST PAYLOAD', {
        endpoint: `${GRAPH}/${pageId}/feed`,
        message: payload.content.slice(0, 100) + (payload.content.length > 100 ? '…' : ''),
        link: payload.link ?? '(none — no OG preview will appear)',
      });

      const res = await fetch(`${GRAPH}/${pageId}/feed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyObj),
      });
      const json = (await res.json()) as { id?: string; error?: { message?: string; code?: number } };

      console.log('[facebook] GRAPH API RESPONSE', {
        status: res.status,
        postId: json.id ?? null,
        error: json.error ?? null,
      });

      if (!res.ok || !json.id) {
        const msg = json.error?.message ?? `HTTP ${res.status}`;
        console.error('[facebook] publish failed:', msg);
        return { ok: false, error: msg };
      }
      return { ok: true, externalId: json.id };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error('[facebook] publish error:', msg, 'token:', maskToken(token));
      return { ok: false, error: msg };
    }
  },

  async getInsights(externalId: string): Promise<PostInsights | null> {
    const { token } = getCredentials();
    try {
      const params = new URLSearchParams({
        fields: 'reactions.summary(total_count),comments.summary(total_count),shares',
        access_token: token,
      });
      const res = await fetch(`${GRAPH}/${externalId}?${params}`);
      if (!res.ok) return null;

      const json = (await res.json()) as {
        reactions?: { summary?: { total_count?: number } };
        comments?: { summary?: { total_count?: number } };
        shares?: { count?: number };
        error?: unknown;
      };

      if (json.error) return null;

      // Fetch impressions separately (requires insights endpoint)
      let reach = 0;
      try {
        const insightParams = new URLSearchParams({
          metric: 'post_impressions_unique',
          access_token: token,
        });
        const insightRes = await fetch(`${GRAPH}/${externalId}/insights?${insightParams}`);
        if (insightRes.ok) {
          const insightJson = (await insightRes.json()) as {
            data?: Array<{ values?: Array<{ value?: number }> }>;
          };
          reach = insightJson.data?.[0]?.values?.[0]?.value ?? 0;
        }
      } catch { /* insights may not be available */ }

      return {
        reactions: json.reactions?.summary?.total_count ?? 0,
        comments: json.comments?.summary?.total_count ?? 0,
        shares: json.shares?.count ?? 0,
        reach,
        clicks: 0,
      };
    } catch {
      return null;
    }
  },
};

export async function fetchPagePosts(limit = 25): Promise<PagePost[]> {
  const { pageId, token } = getCredentials();
  const params = new URLSearchParams({
    fields: 'id,message,created_time,permalink_url,reactions.summary(total_count),comments.summary(total_count),shares',
    access_token: token,
    limit: String(limit),
  });

  const res = await fetch(`${GRAPH}/${pageId}/published_posts?${params}`);
  if (!res.ok) {
    console.error('[facebook] fetchPagePosts failed:', res.status);
    return [];
  }

  const json = (await res.json()) as { data?: RawPost[]; error?: unknown };
  if (json.error || !Array.isArray(json.data)) return [];

  return json.data.map((p) => ({
    id: p.id,
    message: p.message ?? '',
    createdAt: new Date(p.created_time),
    permalink: p.permalink_url ?? '',
    reactions: p.reactions?.summary?.total_count ?? 0,
    comments: p.comments?.summary?.total_count ?? 0,
    shares: p.shares?.count ?? 0,
  }));
}

interface RawPost {
  id: string;
  message?: string;
  created_time: string;
  permalink_url?: string;
  reactions?: { summary?: { total_count?: number } };
  comments?: { summary?: { total_count?: number } };
  shares?: { count?: number };
}

export interface PagePost {
  id: string;
  message: string;
  createdAt: Date;
  permalink: string;
  reactions: number;
  comments: number;
  shares: number;
}
