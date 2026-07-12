import AdminNav from './AdminNav';

interface AdminShellProps {
  children: React.ReactNode;
  user: { name: string; email: string; role: string };
}

export default function AdminShell({ children, user }: AdminShellProps) {
  return (
    <div className="min-h-dvh bg-slate-100 dark:bg-slate-950 overflow-x-hidden">
      <AdminNav user={user} />
      <main className="lg:pl-64 pt-14 lg:pt-0">
        <div className="p-4 sm:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
