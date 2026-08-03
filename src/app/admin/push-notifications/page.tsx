import type { Metadata } from 'next';
import { BRAND } from '@/config/brand';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import AdminShell from '@/components/admin/AdminShell';
import PushDashboard from './PushDashboard';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: `Push Notifications | Admin ${BRAND.name}`,
};

export default async function PushNotificationsPage() {
  const session = await auth();
  if (!session?.user) redirect('/admin/login');

  return (
    <AdminShell user={{ name: session.user.name, email: session.user.email, role: session.user.role }}>
      <PushDashboard />
    </AdminShell>
  );
}
