import type { Metadata } from 'next';
import { Suspense } from 'react';
import LoginForm from './LoginForm';
import Logo from '@/components/ui/Logo';
import { BRAND } from '@/config/brand';

export const metadata: Metadata = {
  title: `Admin Login | ${BRAND.name}`,
};

export default function LoginPage() {
  return (
    <div className="w-full max-w-sm">
      {/* Logo */}
      <div className="text-center mb-8">
        <Logo size="lg" />
        <p className="text-slate-500 text-xs tracking-widest mt-1">ADMIN PANEL</p>
      </div>

      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
