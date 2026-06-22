'use client';

import { useCallback, useEffect, useState } from 'react';
import {
    Users, Activity, UserPlus, Trash2, KeyRound, ShieldCheck, X,
    Database, FileText, Layers, FolderTree, Loader2,
} from 'lucide-react';
import type { UserRecord } from '@/types';

interface Stats {
    users: { total: number; admin: number; officer: number };
    cases: number;
    embeddings: number;
    folders: number;
}

type Tab = 'users' | 'system';

const roleBadge = (role: string) =>
    role === 'admin'
        ? 'bg-primary-100 text-primary-800'
        : 'bg-gray-100 text-gray-600';

export default function AdminPanel({ currentUserId }: { currentUserId: string }) {
    const [tab, setTab] = useState<Tab>('users');

    return (
        <div className="max-w-6xl mx-auto">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                    <ShieldCheck className="w-6 h-6 text-primary-700" />
                    Pentadbiran
                </h1>
                <p className="text-sm text-gray-500 mt-1">Urus pengguna dan pantau sistem.</p>
            </div>

            <div className="flex gap-1 border-b border-gray-200 mb-6">
                <TabButton active={tab === 'users'} onClick={() => setTab('users')} icon={Users} label="Pengurusan Pengguna" />
                <TabButton active={tab === 'system'} onClick={() => setTab('system')} icon={Activity} label="Sistem" />
            </div>

            {tab === 'users' ? <UsersTab currentUserId={currentUserId} /> : <SystemTab />}
        </div>
    );
}

function TabButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof Users; label: string }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                active
                    ? 'border-primary-700 text-primary-800'
                    : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
        >
            <Icon className="w-4 h-4" />
            {label}
        </button>
    );
}

/* ------------------------------- Users tab ------------------------------- */

function UsersTab({ currentUserId }: { currentUserId: string }) {
    const [users, setUsers] = useState<UserRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [showAdd, setShowAdd] = useState(false);
    const [resetTarget, setResetTarget] = useState<UserRecord | null>(null);
    const [busyId, setBusyId] = useState<number | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const res = await fetch('/api/admin/users');
            if (!res.ok) throw new Error('Gagal memuatkan senarai pengguna.');
            const data = await res.json();
            setUsers(data.users);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Ralat tidak diketahui.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    const changeRole = async (u: UserRecord, role: string) => {
        setBusyId(u.id);
        setError('');
        try {
            const res = await fetch(`/api/admin/users/${u.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Gagal menukar peranan.');
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Ralat tidak diketahui.');
        } finally {
            setBusyId(null);
        }
    };

    const deleteUser = async (u: UserRecord) => {
        if (!confirm(`Padam pengguna "${u.email}"? Tindakan ini tidak boleh dibatalkan.`)) return;
        setBusyId(u.id);
        setError('');
        try {
            const res = await fetch(`/api/admin/users/${u.id}`, { method: 'DELETE' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Gagal memadam pengguna.');
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Ralat tidak diketahui.');
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-gray-500">{users.length} pengguna</p>
                <button
                    type="button"
                    onClick={() => setShowAdd((v) => !v)}
                    className="flex items-center gap-2 bg-primary-700 text-white text-sm font-semibold px-4 py-2 rounded-md hover:bg-primary-800 transition-colors"
                >
                    <UserPlus className="w-4 h-4" />
                    Tambah Pengguna
                </button>
            </div>

            {showAdd && <AddUserForm onDone={() => { setShowAdd(false); void load(); }} />}

            {error && (
                <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-4">{error}</p>
            )}

            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-12 text-gray-400">
                        <Loader2 className="w-5 h-5 animate-spin" />
                    </div>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                            <tr>
                                <th className="text-left font-semibold px-4 py-3">Pengguna</th>
                                <th className="text-left font-semibold px-4 py-3">Peranan</th>
                                <th className="text-left font-semibold px-4 py-3">Didaftar</th>
                                <th className="text-right font-semibold px-4 py-3">Tindakan</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {users.map((u) => {
                                const isSelf = String(u.id) === currentUserId;
                                return (
                                    <tr key={u.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3">
                                            <div className="font-semibold text-gray-900">{u.name || '—'}</div>
                                            <div className="text-gray-500">{u.email}{isSelf && <span className="ml-2 text-[10px] font-bold uppercase text-primary-600">(Anda)</span>}</div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <select
                                                value={u.role}
                                                disabled={isSelf || busyId === u.id}
                                                onChange={(e) => changeRole(u, e.target.value)}
                                                className={`text-xs font-bold uppercase tracking-wider px-2 py-1 rounded-full border-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-70 ${roleBadge(u.role)}`}
                                            >
                                                <option value="officer">Pegawai</option>
                                                <option value="admin">Pentadbir</option>
                                            </select>
                                        </td>
                                        <td className="px-4 py-3 text-gray-500">
                                            {u.created_at ? new Date(u.created_at).toLocaleDateString('ms-MY') : '—'}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center justify-end gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() => setResetTarget(u)}
                                                    title="Tetapkan semula kata laluan"
                                                    className="p-2 rounded-md text-gray-500 hover:bg-primary-50 hover:text-primary-700 transition-colors"
                                                >
                                                    <KeyRound className="w-4 h-4" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => deleteUser(u)}
                                                    disabled={isSelf || busyId === u.id}
                                                    title={isSelf ? 'Tidak boleh memadam akaun sendiri' : 'Padam pengguna'}
                                                    className="p-2 rounded-md text-gray-500 hover:bg-red-50 hover:text-red-700 transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-gray-500"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {resetTarget && (
                <ResetPasswordModal user={resetTarget} onClose={() => setResetTarget(null)} />
            )}
        </div>
    );
}

function AddUserForm({ onDone }: { onDone: () => void }) {
    const [email, setEmail] = useState('');
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState('officer');
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSubmitting(true);
        try {
            const res = await fetch('/api/admin/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, name, password, role }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Gagal menambah pengguna.');
            onDone();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Ralat tidak diketahui.');
        } finally {
            setSubmitting(false);
        }
    };

    const inputCls = 'w-full border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:border-primary-600 focus:ring-1 focus:ring-primary-600';

    return (
        <form onSubmit={submit} className="bg-white border border-gray-200 rounded-lg p-4 mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Emel</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={inputCls} placeholder="nama@agc.local" />
            </div>
            <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Nama</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Nama penuh" />
            </div>
            <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Kata Laluan (min 8 aksara)</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} className={inputCls} placeholder="••••••••" />
            </div>
            <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Peranan</label>
                <select value={role} onChange={(e) => setRole(e.target.value)} className={inputCls}>
                    <option value="officer">Pegawai</option>
                    <option value="admin">Pentadbir</option>
                </select>
            </div>
            {error && <p className="sm:col-span-2 text-sm text-red-700">{error}</p>}
            <div className="sm:col-span-2 flex justify-end gap-2">
                <button type="button" onClick={onDone} className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-900">Batal</button>
                <button type="submit" disabled={submitting} className="px-4 py-2 text-sm font-semibold bg-primary-700 text-white rounded-md hover:bg-primary-800 disabled:opacity-60">
                    {submitting ? 'Menyimpan…' : 'Simpan'}
                </button>
            </div>
        </form>
    );
}

function ResetPasswordModal({ user, onClose }: { user: UserRecord; onClose: () => void }) {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [done, setDone] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSubmitting(true);
        try {
            const res = await fetch(`/api/admin/users/${user.id}/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ newPassword: password }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Gagal menetapkan semula kata laluan.');
            setDone(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Ralat tidak diketahui.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-gray-900 flex items-center gap-2"><KeyRound className="w-4 h-4 text-primary-700" /> Tetapkan Semula Kata Laluan</h3>
                    <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
                </div>
                <p className="text-sm text-gray-500 mb-4">Untuk <span className="font-semibold text-gray-700">{user.email}</span></p>
                {done ? (
                    <div>
                        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2 mb-4">Kata laluan berjaya dikemas kini.</p>
                        <div className="flex justify-end">
                            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold bg-primary-700 text-white rounded-md hover:bg-primary-800">Tutup</button>
                        </div>
                    </div>
                ) : (
                    <form onSubmit={submit}>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            minLength={8}
                            autoFocus
                            placeholder="Kata laluan baharu (min 8 aksara)"
                            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:border-primary-600 focus:ring-1 focus:ring-primary-600 mb-3"
                        />
                        {error && <p className="text-sm text-red-700 mb-3">{error}</p>}
                        <div className="flex justify-end gap-2">
                            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-900">Batal</button>
                            <button type="submit" disabled={submitting} className="px-4 py-2 text-sm font-semibold bg-primary-700 text-white rounded-md hover:bg-primary-800 disabled:opacity-60">
                                {submitting ? 'Menyimpan…' : 'Tetapkan Semula'}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}

/* ------------------------------ System tab ------------------------------ */

function SystemTab() {
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch('/api/admin/stats');
                if (!res.ok) throw new Error('Gagal memuatkan statistik.');
                setStats(await res.json());
            } catch (e) {
                setError(e instanceof Error ? e.message : 'Ralat tidak diketahui.');
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    if (loading) {
        return <div className="flex items-center justify-center py-12 text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>;
    }
    if (error || !stats) {
        return <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error || 'Tiada data.'}</p>;
    }

    const cards = [
        { label: 'Jumlah Pengguna', value: stats.users.total, sub: `${stats.users.admin} pentadbir · ${stats.users.officer} pegawai`, icon: Users },
        { label: 'Jumlah Kes', value: stats.cases, sub: 'Rekod LKK', icon: FileText },
        { label: 'Embeddings', value: stats.embeddings, sub: 'Chunk vektor (RAG)', icon: Layers },
        { label: 'Folder Sumber', value: stats.folders, sub: 'Kategori Akta', icon: FolderTree },
    ];

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {cards.map((c) => {
                const Icon = c.icon;
                return (
                    <div key={c.label} className="bg-white border border-gray-200 rounded-lg p-5">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">{c.label}</span>
                            <Icon className="w-5 h-5 text-primary-600" />
                        </div>
                        <div className="text-3xl font-bold text-gray-900">{c.value.toLocaleString('ms-MY')}</div>
                        <p className="text-xs text-gray-400 mt-1">{c.sub}</p>
                    </div>
                );
            })}
            <div className="sm:col-span-2 lg:col-span-4 flex items-center gap-2 text-xs text-gray-400 mt-1">
                <Database className="w-3.5 h-3.5" /> Statistik langsung daripada pangkalan data Postgres.
            </div>
        </div>
    );
}
