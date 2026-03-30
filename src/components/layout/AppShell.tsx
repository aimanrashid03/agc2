'use client';

import { usePathname } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthRoute = pathname.startsWith('/auth');

  if (isAuthRoute) {
    return <main className="min-h-screen">{children}</main>;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-4">{children}</main>
    </div>
  );
}
