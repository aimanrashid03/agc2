'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileText, ChevronLeft, ChevronRight, MessageSquare, LogOut, LayoutDashboard, Settings, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { signOut, useSession } from 'next-auth/react';

const NAV_ITEMS = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/', label: 'Senarai Kes', icon: FileText },
    { href: '/chat', label: 'Chat AI', icon: MessageSquare },
];

// Shown to every signed-in user (lower group). Admin-only items appended at runtime.
const SECONDARY_ITEMS = [
    { href: '/settings', label: 'Tetapan', icon: Settings },
];

const ADMIN_ITEM = { href: '/admin', label: 'Pentadbiran', icon: ShieldCheck };

const Sidebar = () => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const pathname = usePathname();
    const { data: session } = useSession();

    const role = session?.user?.role ?? 'officer';
    const isAdmin = role === 'admin';
    const displayName = session?.user?.name || session?.user?.email || 'Pengguna';
    const roleLabel = isAdmin ? 'Pentadbir' : 'Pegawai';

    const secondaryItems = isAdmin ? [...SECONDARY_ITEMS, ADMIN_ITEM] : SECONDARY_ITEMS;

    const isActiveRoute = (href: string) => {
        if (href === '/') {
            return pathname === '/' || pathname.startsWith('/cases/');
        }

        return pathname === href || pathname.startsWith(`${href}/`);
    };

    const getNavClassName = (href: string) => {
        const isActive = isActiveRoute(href);

        return `group flex items-center ${isCollapsed ? 'justify-center px-0' : 'px-3'} py-2 text-sm font-medium rounded-md transition-colors ${
            isActive
                ? 'bg-primary-100 text-primary-800 border border-primary-200'
                : 'text-gray-700 hover:bg-primary-50 hover:text-primary-700'
        }`;
    };

    const getIconClassName = (href: string) => {
        const isActive = isActiveRoute(href);

        return `w-4 h-4 flex-shrink-0 ${isActive ? 'text-primary-700' : 'group-hover:text-primary-600'}`;
    };

    const handleSignOut = async () => {
        await signOut({ redirectTo: '/auth/login' });
    };

    const renderNavItem = (item: { href: string; label: string; icon: typeof FileText }) => {
        const Icon = item.icon;
        const isActive = isActiveRoute(item.href);

        return (
            <Link
                key={item.href}
                href={item.href}
                className={getNavClassName(item.href)}
                aria-current={isActive ? 'page' : undefined}
            >
                <Icon className={getIconClassName(item.href)} />
                {!isCollapsed && <span className="ml-3 truncate">{item.label}</span>}
            </Link>
        );
    };

    return (
        <div
            className={`${isCollapsed ? 'w-16' : 'w-60'} h-screen bg-white border-r border-gray-200 flex flex-col pt-2 transition-all duration-300 ease-in-out relative`}
        >
            <div className={`px-4 py-4 border-b border-gray-100 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
                {!isCollapsed && (
                    <div className="overflow-hidden">
                        <h1 className="text-lg font-bold text-gray-900 tracking-tight whitespace-nowrap">AGC Cases</h1>
                        <p className="text-[10px] uppercase tracking-wider text-primary-600 font-semibold mt-0.5 whitespace-nowrap">Sistem Pengurusan Kes</p>
                    </div>
                )}
                <button
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="p-1 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
                >
                    {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                </button>
            </div>

            <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
                {NAV_ITEMS.map(renderNavItem)}

                <div className="pt-3 mt-3 border-t border-gray-100 space-y-1">
                    {secondaryItems.map(renderNavItem)}
                </div>
            </nav>

            <div className="px-2 py-3 border-t border-gray-100">
                {!isCollapsed && (
                    <div className="px-3 pb-3 mb-1">
                        <p className="text-sm font-semibold text-gray-800 truncate">{displayName}</p>
                        <span
                            className={`mt-1 inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                                isAdmin ? 'bg-primary-100 text-primary-800' : 'bg-gray-100 text-gray-600'
                            }`}
                        >
                            {roleLabel}
                        </span>
                    </div>
                )}
                <button
                    type="button"
                    onClick={handleSignOut}
                    className={`w-full flex items-center ${isCollapsed ? 'justify-center px-0' : 'px-3'} py-2 text-sm font-medium text-gray-700 hover:bg-red-50 hover:text-red-700 rounded-md transition-colors group`}
                >
                    <LogOut className="w-4 h-4 flex-shrink-0" />
                    {!isCollapsed && <span className="ml-3 truncate">Log Keluar</span>}
                </button>
            </div>

        </div>
    );
};

export default Sidebar;
