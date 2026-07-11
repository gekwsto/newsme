'use server';

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { clearSemanticDbCache } from '@/lib/semantic-service-db';

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');
  return session.user;
}

// ─── Category actions ─────────────────────────────────────────────────────────

export async function updateCategoryWeight(id: string, weight: number) {
  await requireAdmin();
  if (weight <= 0 || weight > 5) throw new Error('Weight must be between 0 and 5');

  const before = await prisma.semanticCategory.findUniqueOrThrow({ where: { id } });
  await prisma.semanticCategory.update({ where: { id }, data: { weight } });
  await prisma.semanticAuditLog.create({
    data: {
      entityType: 'SemanticCategory',
      entityId: id,
      action: 'updateWeight',
      before: { weight: before.weight } as never,
      after: { weight } as never,
    },
  });

  clearSemanticDbCache();
  revalidatePath('/admin/semantic-system');
  revalidatePath('/admin/semantic-system/categories');
}

export async function toggleCategoryActive(id: string, isActive: boolean) {
  await requireAdmin();
  await prisma.semanticCategory.update({ where: { id }, data: { isActive } });
  await prisma.semanticAuditLog.create({
    data: {
      entityType: 'SemanticCategory',
      entityId: id,
      action: isActive ? 'activate' : 'deactivate',
    },
  });
  clearSemanticDbCache();
  revalidatePath('/admin/semantic-system/categories');
}

// ─── Tag actions ───────────────────────────────────────────────────────────────

export async function updateTagWeight(id: string, weight: number) {
  await requireAdmin();
  if (weight <= 0 || weight > 5) throw new Error('Weight must be between 0 and 5');

  const before = await prisma.semanticTag.findUniqueOrThrow({ where: { id } });
  await prisma.semanticTag.update({ where: { id }, data: { weight } });
  await prisma.semanticAuditLog.create({
    data: {
      entityType: 'SemanticTag',
      entityId: id,
      action: 'updateWeight',
      before: { weight: before.weight } as never,
      after: { weight } as never,
    },
  });

  clearSemanticDbCache();
  revalidatePath('/admin/semantic-system/tags');
  revalidatePath(`/admin/semantic-system/tags/${id}`);
}

export async function updateTagFlags(id: string, flags: {
  isPriority?: boolean;
  useForArticleTagging?: boolean;
  useForImageMatching?: boolean;
  isActive?: boolean;
}) {
  await requireAdmin();
  await prisma.semanticTag.update({ where: { id }, data: flags });
  await prisma.semanticAuditLog.create({
    data: {
      entityType: 'SemanticTag',
      entityId: id,
      action: 'updateFlags',
      after: flags as never,
    },
  });
  clearSemanticDbCache();
  revalidatePath(`/admin/semantic-system/tags/${id}`);
  revalidatePath('/admin/semantic-system/tags');
}

// ─── Alias actions ────────────────────────────────────────────────────────────

export async function addAlias(semanticTagId: string, alias: string) {
  await requireAdmin();
  const trimmed = alias.trim();
  if (!trimmed) throw new Error('Alias cannot be empty');

  // Guard against cross-tag conflicts
  const conflict = await prisma.semanticTagAlias.findFirst({
    where: { alias: trimmed, semanticTagId: { not: semanticTagId } },
    include: { semanticTag: { select: { name: true } } },
  });
  if (conflict) {
    throw new Error(`Alias "${trimmed}" already belongs to tag "${conflict.semanticTag.name}"`);
  }

  await prisma.semanticTagAlias.upsert({
    where: { semanticTagId_alias: { semanticTagId, alias: trimmed } },
    create: { semanticTagId, alias: trimmed, isActive: true },
    update: { isActive: true },
  });

  await prisma.semanticAuditLog.create({
    data: {
      entityType: 'SemanticTagAlias',
      entityId: semanticTagId,
      action: 'addAlias',
      after: { alias: trimmed } as never,
    },
  });

  clearSemanticDbCache();
  revalidatePath(`/admin/semantic-system/tags/${semanticTagId}`);
}

export async function toggleAlias(aliasId: string, isActive: boolean, semanticTagId: string) {
  await requireAdmin();
  await prisma.semanticTagAlias.update({ where: { id: aliasId }, data: { isActive } });
  await prisma.semanticAuditLog.create({
    data: {
      entityType: 'SemanticTagAlias',
      entityId: aliasId,
      action: isActive ? 'activateAlias' : 'deactivateAlias',
    },
  });
  clearSemanticDbCache();
  revalidatePath(`/admin/semantic-system/tags/${semanticTagId}`);
}
