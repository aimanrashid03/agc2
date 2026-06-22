import { auth } from '@/auth';
import type { Session } from 'next-auth';

/**
 * Server-side RBAC guard — single source of truth for "is this an admin?".
 * Returns the session when the current user has role 'admin', otherwise null.
 *
 * Used by every /api/admin/* route (respond 403 on null) and the /admin page
 * (redirect on null). The edge gate in src/proxy.ts is a courtesy redirect only;
 * this is the real boundary. Node runtime (auth() reads cookies + JWT).
 */
export async function getAdminSession(): Promise<Session | null> {
    const session = await auth();
    if (session?.user?.role === 'admin') return session;
    return null;
}
