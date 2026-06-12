// Platform abstraction layer — add new platforms by implementing PlatformClient.
// Today: Facebook. Tomorrow: Instagram, LinkedIn, X, Newsletter.

export type PlatformKey = 'facebook' | 'instagram' | 'linkedin' | 'twitter' | 'newsletter';

export interface PostPayload {
  content: string;
  imageUrl?: string;
  link?: string;
}

export type PostResult =
  | { ok: true; externalId: string }
  | { ok: false; error: string };

export interface PostInsights {
  reactions: number;
  comments: number;
  shares: number;
  reach: number;
  clicks: number;
}

export interface PlatformClient {
  publish(payload: PostPayload): Promise<PostResult>;
  getInsights(externalId: string): Promise<PostInsights | null>;
}

// Platform metadata — used for UI labels and future routing
export const PLATFORM_META: Record<PlatformKey, { label: string; emoji: string; color: string }> = {
  facebook:   { label: 'Facebook',   emoji: '📘', color: '#1877F2' },
  instagram:  { label: 'Instagram',  emoji: '📸', color: '#E4405F' },
  linkedin:   { label: 'LinkedIn',   emoji: '💼', color: '#0A66C2' },
  twitter:    { label: 'X (Twitter)', emoji: '𝕏', color: '#000000' },
  newsletter: { label: 'Newsletter', emoji: '📧', color: '#6366f1' },
};
