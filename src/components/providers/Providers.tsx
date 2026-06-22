'use client';

import { SessionProvider } from 'next-auth/react';
import type { Session } from 'next-auth';

/**
 * Client-side context providers. SessionProvider lets client components read the
 * current session via useSession() (e.g. Sidebar role-aware nav). The `session`
 * prop is resolved server-side in the root layout so there's no extra fetch on load.
 */
export default function Providers({
    children,
    session,
}: {
    children: React.ReactNode;
    session: Session | null;
}) {
    return <SessionProvider session={session}>{children}</SessionProvider>;
}
