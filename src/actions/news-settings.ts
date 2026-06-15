'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';

async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Δεν είσαι συνδεδεμένος');
  return session.user;
}

export interface AutomationSettingsData {
  rssScanIntervalMinutes: number;
  maxNewsPerDay: number;
  publishMode: string;
  facebookAutoPost: boolean;
  allowedPublishHours: number[];
  minimumImportanceScore: number;
  dailyAiBudgetLimit: number;
  isEnabled: boolean;
}

export type SettingsResult = { ok: true } | { ok: false; error: string };

export async function getNewsAutomationSettings() {
  const settings = await prisma.newsAutomationSettings.findFirst({ orderBy: { createdAt: 'asc' } });
  if (settings) return settings;

  return prisma.newsAutomationSettings.create({ data: {} });
}

export async function updateNewsAutomationSettings(data: AutomationSettingsData): Promise<SettingsResult> {
  try {
    await requireAuth();
    const existing = await prisma.newsAutomationSettings.findFirst({ orderBy: { createdAt: 'asc' } });
    if (existing) {
      await prisma.newsAutomationSettings.update({ where: { id: existing.id }, data });
    } else {
      await prisma.newsAutomationSettings.create({ data });
    }
    revalidatePath('/admin/news-settings');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Σφάλμα' };
  }
}

export interface ImageSettingsData {
  categoryId: string;
  imageMode: string;
  templateColor: string;
}

export async function getCategoryImageSettings() {
  return prisma.categoryImageSettings.findMany({
    orderBy: { categoryId: 'asc' },
  });
}

export async function upsertCategoryImageSettings(data: ImageSettingsData): Promise<SettingsResult> {
  try {
    await requireAuth();
    await prisma.categoryImageSettings.upsert({
      where: { categoryId: data.categoryId },
      update: { imageMode: data.imageMode, templateColor: data.templateColor },
      create: data,
    });
    revalidatePath('/admin/image-settings');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Σφάλμα' };
  }
}

export async function toggleSourceAutoGeneration(sourceId: string, allowAutoGeneration: boolean): Promise<SettingsResult> {
  try {
    await requireAuth();
    await prisma.rssSource.update({ where: { id: sourceId }, data: { allowAutoGeneration } });
    revalidatePath('/admin/sources');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Σφάλμα' };
  }
}
