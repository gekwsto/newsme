'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');
}

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function createAuthor(data: {
  name: string;
  slug?: string;
  bio?: string;
  avatarUrl?: string;
  title?: string;
  isDefault?: boolean;
}) {
  await requireAuth();
  const slug = data.slug?.trim() || toSlug(data.name);
  await prisma.author.create({
    data: {
      name: data.name.trim(),
      slug,
      bio: data.bio?.trim() || null,
      avatarUrl: data.avatarUrl?.trim() || null,
      title: data.title?.trim() || null,
      isDefault: data.isDefault ?? false,
    },
  });
  revalidatePath('/admin/authors');
}

export async function updateAuthor(
  id: string,
  data: {
    name?: string;
    slug?: string;
    bio?: string | null;
    avatarUrl?: string | null;
    title?: string | null;
    isActive?: boolean;
    isDefault?: boolean;
  },
) {
  await requireAuth();
  await prisma.author.update({ where: { id }, data });
  revalidatePath('/admin/authors');
  revalidatePath(`/authors/${data.slug ?? ''}`);
}

export async function toggleAuthorActive(id: string, isActive: boolean) {
  await requireAuth();
  await prisma.author.update({ where: { id }, data: { isActive } });
  revalidatePath('/admin/authors');
}

export async function setDefaultAuthor(id: string) {
  await requireAuth();
  await prisma.$transaction([
    prisma.author.updateMany({ data: { isDefault: false } }),
    prisma.author.update({ where: { id }, data: { isDefault: true } }),
  ]);
  revalidatePath('/admin/authors');
}
