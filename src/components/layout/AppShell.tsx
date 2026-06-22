'use client';

import { usePathname } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import ChatWidget from '@/components/ChatWidget';
import type { ChatbotSettings } from '@/lib/chatbotDefaults';

// Pages where the floating chat widget is intentionally suppressed: the dedicated chat
// page (redundant) plus Settings/Admin (config surfaces). Auth routes are excluded via
// the early return below.
const HIDE_WIDGET_ON = ['/chat', '/settings', '/admin'];

export default function AppShell({
  children,
  chatbotSettings,
}: {
  children: React.ReactNode;
  chatbotSettings: ChatbotSettings;
}) {
  const pathname = usePathname();
  const isAuthRoute = pathname.startsWith('/auth');

  if (isAuthRoute) {
    return <main className="min-h-screen">{children}</main>;
  }

  const hideWidget = HIDE_WIDGET_ON.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-4">{children}</main>
      {!hideWidget && <ChatWidget {...chatbotSettings} />}
    </div>
  );
}
