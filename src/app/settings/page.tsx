import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import SettingsTabs from '@/components/settings/SettingsTabs';

// Settings available to every signed-in user (admin + officer).
export default async function SettingsPage() {
    const session = await auth();
    if (!session?.user) redirect('/auth/login');

    return (
        <SettingsTabs
            name={session.user.name ?? ''}
            email={session.user.email ?? ''}
            role={session.user.role ?? 'officer'}
        />
    );
}
