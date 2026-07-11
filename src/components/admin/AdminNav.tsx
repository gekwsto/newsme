'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import {
  LayoutDashboard,
  CheckSquare,
  FileText,
  LogOut,
  ChevronRight,
  Sparkles,
  Rss,
  Newspaper,
  MessageSquare,
  Activity,
  BarChart2,
  AlertTriangle,
  ShieldCheck,
  SearchCheck,
  TreePine,
  Brain,
  ListOrdered,
  Settings,
  ImageIcon,
  Images,
  Workflow,
  GraduationCap,
  Users,
  Tag,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AdminNavProps {
  user: { name: string; email: string; role: string };
}

const navItems = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/admin/approvals', label: 'Approvals', icon: CheckSquare, exact: false },
  { href: '/admin/publishing-queue', label: 'Queue', icon: ListOrdered, exact: false },
  { href: '/admin/articles', label: 'Άρθρα', icon: FileText, exact: false },
  { href: '/admin/authors', label: 'Authors', icon: Users, exact: false },
  { href: '/admin/ai-generator', label: 'AI Generator', icon: Sparkles, exact: false },
  { href: '/admin/news-discovery', label: 'Discovery', icon: Newspaper, exact: false },
  { href: '/admin/semantic-matrix', label: 'Semantic Matrix', icon: Brain, exact: false },
  { href: '/admin/semantic-system', label: 'Semantic System', icon: Brain, exact: false },
  { href: '/admin/semantic-system/shadow', label: 'Shadow Mode', icon: Activity, exact: false },
  { href: '/admin/sources', label: 'RSS Sources', icon: Rss, exact: false },
  { href: '/admin/news-settings', label: 'Auto Pipeline', icon: Workflow, exact: false },
  { href: '/admin/pipeline-logs', label: 'Pipeline Logs', icon: Activity, exact: false },
  { href: '/admin/image-library', label: 'Image Library', icon: Images, exact: false },
  { href: '/admin/image-library/taxonomy', label: 'Image Taxonomy', icon: Tag, exact: false },
  { href: '/admin/image-settings', label: 'Image Settings', icon: ImageIcon, exact: false },
  { href: '/admin/social-posts', label: 'Social Posts', icon: MessageSquare, exact: false },
  { href: '/admin/analytics', label: 'Analytics', icon: BarChart2, exact: false },
  { href: '/admin/operations', label: 'Operations', icon: Settings, exact: false },
  { href: '/admin/errors', label: 'Errors', icon: AlertTriangle, exact: false },
  { href: '/admin/readiness', label: 'Readiness', icon: ShieldCheck, exact: false },
  { href: '/admin/seo', label: 'SEO', icon: SearchCheck, exact: false },
  { href: '/admin/evergreen', label: 'Evergreen', icon: TreePine, exact: false },
  { href: '/admin/evergreen-opportunities', label: 'AI Learning', icon: Brain, exact: false },
  { href: '/admin/training-data', label: 'Training Data', icon: GraduationCap, exact: false },
  { href: '/admin/article-review', label: 'Article Review', icon: CheckSquare, exact: false },
];

export default function AdminNav({ user }: AdminNavProps) {
  const pathname = usePathname();

  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  return (
    <>
      {/* Sidebar — desktop */}
      <aside className="hidden lg:flex flex-col fixed inset-y-0 left-0 w-64 bg-slate-900 border-r border-slate-800 z-40">
        {/* Logo */}
        <div className="px-6 py-5 border-b border-slate-800">
          <Link href="/" className="inline-flex flex-col leading-none">
            <span className="font-black text-base tracking-widest">
              <span className="text-red-500">ΑΙ</span>
              <span className="text-white">ΣΧΟΛΙΑΣΜΟΣ</span>
            </span>
            <span className="text-slate-500 text-[9px] tracking-widest mt-0.5">ADMIN PANEL</span>
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(({ href, label, icon: Icon, exact }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive(href, exact)
                  ? 'bg-red-600/20 text-red-400 border border-red-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              )}
            >
              <Icon size={16} />
              {label}
              {isActive(href, exact) && <ChevronRight size={14} className="ml-auto" />}
            </Link>
          ))}
        </nav>

        {/* User + logout */}
        <div className="px-3 py-4 border-t border-slate-800">
          <div className="px-3 py-2 mb-2">
            <p className="text-white text-sm font-semibold truncate">{user.name}</p>
            <p className="text-slate-500 text-xs truncate">{user.email}</p>
            <span className="inline-block mt-1 text-[10px] font-bold uppercase tracking-wider text-violet-400 bg-violet-900/30 px-2 py-0.5 rounded-full">
              {user.role}
            </span>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/admin/login' })}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <LogOut size={16} />
            Αποσύνδεση
          </button>
        </div>
      </aside>

      {/* Top bar — mobile */}
      <header className="lg:hidden fixed top-0 inset-x-0 z-40 bg-slate-900 border-b border-slate-800 px-4 h-14 flex items-center justify-between">
        <Link href="/" className="font-black text-sm tracking-widest">
          <span className="text-red-500">ΑΙ</span>
          <span className="text-white">ΣΧΟΛΙΑΣΜΟΣ</span>
        </Link>
        <nav className="flex items-center gap-1">
          {navItems.map(({ href, label, icon: Icon, exact }) => (
            <Link
              key={href}
              href={href}
              title={label}
              className={cn(
                'p-2 rounded-lg transition-colors',
                isActive(href, exact)
                  ? 'text-red-400 bg-red-600/10'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              )}
            >
              <Icon size={18} />
            </Link>
          ))}
          <button
            onClick={() => signOut({ callbackUrl: '/admin/login' })}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Αποσύνδεση"
          >
            <LogOut size={18} />
          </button>
        </nav>
      </header>
    </>
  );
}
