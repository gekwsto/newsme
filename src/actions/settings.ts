'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { getEditorialConfig, setEditorialConfig } from '@/lib/editorial-config';

async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');
}

export async function toggleAutoFilter(enabled: boolean): Promise<{ ok: true; enabled: boolean } | { ok: false; error: string }> {
  try {
    await requireAuth();
    setEditorialConfig({ autoFilterEnabled: enabled });
    revalidatePath('/admin/news-discovery');
    return { ok: true, enabled };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error' };
  }
}

export async function readAutoFilterEnabled(): Promise<boolean> {
  return getEditorialConfig().autoFilterEnabled;
}
