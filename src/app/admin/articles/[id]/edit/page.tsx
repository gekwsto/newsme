import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import AdminShell from '@/components/admin/AdminShell';
import ArticleEditForm from './ArticleEditForm';
import ImageManager from './ImageManager';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Επεξεργασία Άρθρου | Admin ΑΙΣΧΟΛΙΑΣΜΟΣ',
};

export default async function ArticleEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/admin/login');

  const { id } = await params;

  const [article, categories] = await Promise.all([
    prisma.article.findUnique({
      where: { id },
      include: { category: true },
    }),
    prisma.category.findMany({ orderBy: { name: 'asc' } }),
  ]);

  if (!article) notFound();

  return (
    <AdminShell user={{ name: session.user.name, email: session.user.email, role: session.user.role }}>
      <div className="max-w-4xl">
        <div className="mb-6">
          <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100">
            Επεξεργασία Άρθρου
          </h1>
          <p className="text-slate-400 text-sm mt-1 truncate">{article.title}</p>
        </div>
        <ArticleEditForm
          article={article}
          categories={categories}
          imageSlot={
            <ImageManager
              key="image-manager"
              articleId={article.id}
              articleStatus={article.status}
              currentImageUrl={article.generatedImageUrl ?? article.coverImage ?? null}
              suggestedImageUrl={article.suggestedImageUrl ?? null}
              imageStatus={article.imageStatus}
              imageSource={article.imageSource ?? null}
              imageProvider={article.imageProvider ?? null}
              imageAttribution={article.imageAttribution ?? null}
              imageCostEstimate={article.imageCostEstimate ?? null}
            />
          }
        />
      </div>
    </AdminShell>
  );
}
