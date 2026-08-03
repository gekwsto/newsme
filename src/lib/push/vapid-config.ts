/**
 * VAPID configuration for Web Push.
 * Only used server-side — never imported from client components.
 */

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

let _config: VapidConfig | null = null;

export function getVapidConfig(): VapidConfig {
  if (_config) return _config;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:admin@newsme.gr';

  if (!publicKey || !privateKey) {
    throw new Error(
      '[Web Push] Missing VAPID configuration. ' +
        'Set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in your environment. ' +
        'Generate keys with: npx web-push generate-vapid-keys',
    );
  }

  _config = { publicKey, privateKey, subject };
  return _config;
}

export function isVapidConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY,
  );
}
