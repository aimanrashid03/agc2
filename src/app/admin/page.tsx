import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/auth-guard';
import AdminPanel from '@/components/admin/AdminPanel';

// Admin-only area. Server guard is the security boundary (proxy.ts redirect is secondary).
export default async function AdminPage() {
    const session = await getAdminSession();
    if (!session) redirect('/');

    return <AdminPanel currentUserId={String(session.user?.id ?? '')} />;
}
