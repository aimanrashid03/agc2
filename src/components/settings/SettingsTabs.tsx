'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { User, Lock, Mail, ShieldCheck } from 'lucide-react';

type Tab = 'profile' | 'security';

export default function SettingsTabs({ name, email, role }: { name: string; email: string; role: string }) {
    const [tab, setTab] = useState<Tab>('profile');
    const roleLabel = role === 'admin' ? 'Pentadbir' : 'Pegawai';

    return (
        <div className="max-w-2xl mx-auto">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900">Tetapan</h1>
                <p className="text-sm text-gray-500 mt-1">Urus profil dan keselamatan akaun anda.</p>
            </div>

            <div className="flex gap-1 border-b border-gray-200 mb-6">
                <TabButton active={tab === 'profile'} onClick={() => setTab('profile')} icon={User} label="Profil" />
                <TabButton active={tab === 'security'} onClick={() => setTab('security')} icon={Lock} label="Keselamatan" />
            </div>

            {tab === 'profile' ? <ProfileTab name={name} email={email} roleLabel={roleLabel} /> : <SecurityTab />}
        </div>
    );
}

function TabButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof User; label: string }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                active ? 'border-primary-700 text-primary-800' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
        >
            <Icon className="w-4 h-4" />
            {label}
        </button>
    );
}

const inputCls = 'w-full border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:border-primary-600 focus:ring-1 focus:ring-primary-600';

function ProfileTab({ name, email, roleLabel }: { name: string; email: string; roleLabel: string }) {
    const { update } = useSession();
    const [value, setValue] = useState(name);
    const [status, setStatus] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
    const [saving, setSaving] = useState(false);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatus(null);
        setSaving(true);
        try {
            const res = await fetch('/api/account/profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: value }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Gagal mengemas kini profil.');
            // Reflect the new name in the JWT/session so the sidebar updates without re-login.
            await update({ name: data.name });
            setStatus({ kind: 'ok', msg: 'Profil berjaya dikemas kini.' });
        } catch (err) {
            setStatus({ kind: 'err', msg: err instanceof Error ? err.message : 'Ralat tidak diketahui.' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={submit} className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
            <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1 flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> Emel</label>
                <input type="email" value={email} disabled className={`${inputCls} bg-gray-50 text-gray-500 cursor-not-allowed`} />
                <p className="text-xs text-gray-400 mt-1">Emel tidak boleh diubah.</p>
            </div>
            <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1 flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> Peranan</label>
                <input type="text" value={roleLabel} disabled className={`${inputCls} bg-gray-50 text-gray-500 cursor-not-allowed`} />
            </div>
            <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1 flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> Nama Paparan</label>
                <input type="text" value={value} onChange={(e) => setValue(e.target.value)} className={inputCls} placeholder="Nama penuh" />
            </div>
            {status && (
                <p className={`text-sm rounded-md px-3 py-2 ${status.kind === 'ok' ? 'text-green-700 bg-green-50 border border-green-200' : 'text-red-700 bg-red-50 border border-red-200'}`}>{status.msg}</p>
            )}
            <div className="flex justify-end">
                <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-semibold bg-primary-700 text-white rounded-md hover:bg-primary-800 disabled:opacity-60">
                    {saving ? 'Menyimpan…' : 'Simpan Perubahan'}
                </button>
            </div>
        </form>
    );
}

function SecurityTab() {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [status, setStatus] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
    const [saving, setSaving] = useState(false);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatus(null);
        if (newPassword !== confirm) {
            setStatus({ kind: 'err', msg: 'Pengesahan kata laluan tidak sepadan.' });
            return;
        }
        setSaving(true);
        try {
            const res = await fetch('/api/auth/change-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentPassword, newPassword }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Gagal menukar kata laluan.');
            setStatus({ kind: 'ok', msg: 'Kata laluan berjaya ditukar.' });
            setCurrentPassword(''); setNewPassword(''); setConfirm('');
        } catch (err) {
            setStatus({ kind: 'err', msg: err instanceof Error ? err.message : 'Ralat tidak diketahui.' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={submit} className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
            <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Kata Laluan Semasa</label>
                <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required className={inputCls} placeholder="••••••••" />
            </div>
            <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Kata Laluan Baharu (min 8 aksara)</label>
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} className={inputCls} placeholder="••••••••" />
            </div>
            <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Sahkan Kata Laluan Baharu</label>
                <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} className={inputCls} placeholder="••••••••" />
            </div>
            {status && (
                <p className={`text-sm rounded-md px-3 py-2 ${status.kind === 'ok' ? 'text-green-700 bg-green-50 border border-green-200' : 'text-red-700 bg-red-50 border border-red-200'}`}>{status.msg}</p>
            )}
            <div className="flex justify-end">
                <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-semibold bg-primary-700 text-white rounded-md hover:bg-primary-800 disabled:opacity-60">
                    {saving ? 'Menyimpan…' : 'Tukar Kata Laluan'}
                </button>
            </div>
        </form>
    );
}
