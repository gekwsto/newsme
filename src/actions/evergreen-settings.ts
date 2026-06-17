'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';

async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Δεν είσαι συνδεδεμένος');
  return session.user;
}

export interface EvergreenSettingsData {
  isEnabled: boolean;
  allowedHours: number[];
  targetDraftCount: number;
  articlesPerRun: number;
  dailyAiBudgetLimit: number;
}

export type SettingsResult = { ok: true } | { ok: false; error: string };

export async function getEvergreenAutomationSettings() {
  const settings = await prisma.evergreenAutomationSettings.findFirst({
    orderBy: { createdAt: 'asc' },
  });
  if (settings) return settings;
  return prisma.evergreenAutomationSettings.create({ data: {} });
}

export async function updateEvergreenAutomationSettings(
  data: EvergreenSettingsData
): Promise<SettingsResult> {
  try {
    await requireAuth();
    const existing = await prisma.evergreenAutomationSettings.findFirst({
      orderBy: { createdAt: 'asc' },
    });
    if (existing) {
      await prisma.evergreenAutomationSettings.update({ where: { id: existing.id }, data });
    } else {
      await prisma.evergreenAutomationSettings.create({ data });
    }
    revalidatePath('/admin/news-settings');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Σφάλμα' };
  }
}
