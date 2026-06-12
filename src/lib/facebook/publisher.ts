const GRAPH_API_VERSION = 'v25.0';

/**
 * Returns a safe representation of a token for logging purposes.
 * Never logs the full token. Example: "EAAbcd...k9Xz"
 */
export function maskToken(token: string): string {
  if (token.length <= 12) return '***';
  return `${token.slice(0, 6)}...${token.slice(-4)}`;
}

export interface FacebookPublishOptions {
  message: string;
  link?: string;
}

export interface FacebookPublishResult {
  id: string;
}

interface FacebookErrorResponse {
  error: {
    message: string;
    type: string;
    code: number;
  };
}

export async function publishToFacebook(
  options: FacebookPublishOptions
): Promise<FacebookPublishResult> {
  const pageId = process.env.FACEBOOK_PAGE_ID;
  const accessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

  if (!pageId || !accessToken) {
    throw new Error(
      'Λείπουν Facebook credentials. Ορίστε FACEBOOK_PAGE_ID και FACEBOOK_PAGE_ACCESS_TOKEN στο .env.'
    );
  }

  const body: Record<string, string> = {
    message: options.message,
    access_token: accessToken,
  };

  if (options.link) {
    body.link = options.link;
  }

  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${pageId}/feed`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );

  const data = (await response.json()) as FacebookPublishResult | FacebookErrorResponse;

  if ('error' in data) {
    throw new Error(`Facebook API: ${data.error.message} (code ${data.error.code})`);
  }

  if (!response.ok) {
    throw new Error(`Facebook API απέτυχε με HTTP ${response.status}`);
  }

  return data;
}
