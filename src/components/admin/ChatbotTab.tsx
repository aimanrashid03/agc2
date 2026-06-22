'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { DEFAULT_CHATBOT_SETTINGS } from '@/lib/chatbotDefaults';

const inputCls = 'w-full border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:border-primary-600 focus:ring-1 focus:ring-primary-600';

export default function ChatbotTab() {
    const [botName, setBotName] = useState(DEFAULT_CHATBOT_SETTINGS.botName);
    const [welcomeHeading, setWelcomeHeading] = useState(DEFAULT_CHATBOT_SETTINGS.welcomeHeading);
    const [welcomeSubtitle, setWelcomeSubtitle] = useState(DEFAULT_CHATBOT_SETTINGS.welcomeSubtitle);
    const [starterText, setStarterText] = useState(DEFAULT_CHATBOT_SETTINGS.starterPrompts.join('\n'));
    const [refusalMessage, setRefusalMessage] = useState(DEFAULT_CHATBOT_SETTINGS.refusalMessage);
    const [maintenanceEnabled, setMaintenanceEnabled] = useState(false);
    const [maintenanceMessage, setMaintenanceMessage] = useState(DEFAULT_CHATBOT_SETTINGS.maintenanceMessage);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

    // Avatar
    const [hasAvatar, setHasAvatar] = useState(false);
    const [avatarVersion, setAvatarVersion] = useState(0);
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [avatarStatus, setAvatarStatus] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/chatbot-settings');
            if (!res.ok) throw new Error('Gagal memuatkan tetapan.');
            const { settings } = await res.json();
            if (settings) {
                setBotName(settings.bot_name ?? '');
                setWelcomeHeading(settings.welcome_heading ?? '');
                setWelcomeSubtitle(settings.welcome_subtitle ?? '');
                setStarterText(Array.isArray(settings.starter_prompts) ? settings.starter_prompts.join('\n') : '');
                setRefusalMessage(settings.refusal_message ?? '');
                setMaintenanceEnabled(!!settings.maintenance_enabled);
                setMaintenanceMessage(settings.maintenance_message ?? '');
                setHasAvatar(!!settings.has_avatar);
                setAvatarVersion(settings.avatar_updated_at ? new Date(settings.avatar_updated_at).getTime() : 0);
            }
        } catch (e) {
            setStatus({ kind: 'err', msg: e instanceof Error ? e.message : 'Ralat tidak diketahui.' });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    // Manage the object-URL preview lifecycle (revoke on change/unmount).
    useEffect(() => {
        if (!avatarFile) { setPreview(null); return; }
        const url = URL.createObjectURL(avatarFile);
        setPreview(url);
        return () => URL.revokeObjectURL(url);
    }, [avatarFile]);

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatus(null);
        setSaving(true);
        try {
            const starterPrompts = starterText.split('\n').map((s) => s.trim()).filter(Boolean);
            const res = await fetch('/api/admin/chatbot-settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ botName, welcomeHeading, welcomeSubtitle, starterPrompts, refusalMessage, maintenanceEnabled, maintenanceMessage }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Gagal menyimpan tetapan.');
            setStatus({ kind: 'ok', msg: 'Tetapan chatbot berjaya disimpan.' });
        } catch (err) {
            setStatus({ kind: 'err', msg: err instanceof Error ? err.message : 'Ralat tidak diketahui.' });
        } finally {
            setSaving(false);
        }
    };

    const uploadAvatar = async () => {
        if (!avatarFile) return;
        setAvatarStatus(null);
        setUploading(true);
        try {
            const fd = new FormData();
            fd.append('avatar', avatarFile);
            const res = await fetch('/api/admin/chatbot-settings/avatar', { method: 'POST', body: fd });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Gagal memuat naik imej.');
            setAvatarStatus({ kind: 'ok', msg: 'Imej avatar berjaya dikemas kini.' });
            setHasAvatar(true);
            setAvatarFile(null);
            setAvatarVersion(Date.now());
        } catch (err) {
            setAvatarStatus({ kind: 'err', msg: err instanceof Error ? err.message : 'Ralat tidak diketahui.' });
        } finally {
            setUploading(false);
        }
    };

    if (loading) {
        return <div className="flex items-center justify-center py-12 text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>;
    }

    const previewSrc = preview ?? (hasAvatar ? `/api/chatbot/avatar?v=${avatarVersion}` : '/arif/2.jpg');
    const banner = (s: { kind: 'ok' | 'err'; msg: string }) =>
        `text-sm rounded-md px-3 py-2 ${s.kind === 'ok' ? 'text-green-700 bg-green-50 border border-green-200' : 'text-red-700 bg-red-50 border border-red-200'}`;

    return (
        <div className="max-w-2xl space-y-6">
            <div className="bg-white border border-gray-200 rounded-lg p-6">
                <h3 className="font-semibold text-gray-900 mb-1">Avatar</h3>
                <p className="text-sm text-gray-500 mb-4">Imej bulat untuk Arif (PNG/JPEG/WEBP, maks 1 MB).</p>
                <div className="flex items-center gap-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={previewSrc} alt="Pratonton avatar" className="w-16 h-16 rounded-full object-cover border border-gray-200 flex-shrink-0" />
                    <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)}
                        className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-primary-50 file:px-3 file:py-2 file:font-semibold file:text-primary-700 hover:file:bg-primary-100"
                    />
                    <button
                        type="button"
                        onClick={uploadAvatar}
                        disabled={!avatarFile || uploading}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-primary-700 text-white rounded-md hover:bg-primary-800 disabled:opacity-60"
                    >
                        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Muat naik
                    </button>
                </div>
                {avatarStatus && <p className={`mt-3 ${banner(avatarStatus)}`}>{avatarStatus.msg}</p>}
            </div>

            <form onSubmit={save} className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
                <Field label="Nama Bot">
                    <input value={botName} onChange={(e) => setBotName(e.target.value)} maxLength={60} className={inputCls} />
                </Field>
                <Field label="Tajuk Aluan">
                    <input value={welcomeHeading} onChange={(e) => setWelcomeHeading(e.target.value)} maxLength={120} className={inputCls} />
                </Field>
                <Field label="Teks Aluan">
                    <textarea value={welcomeSubtitle} onChange={(e) => setWelcomeSubtitle(e.target.value)} rows={3} maxLength={800} className={inputCls} />
                </Field>
                <Field label="Soalan Cadangan (satu setiap baris)">
                    <textarea value={starterText} onChange={(e) => setStarterText(e.target.value)} rows={4} className={inputCls} />
                </Field>
                <Field label="Mesej Penolakan (apabila tiada kes berkaitan ditemui)">
                    <textarea value={refusalMessage} onChange={(e) => setRefusalMessage(e.target.value)} rows={3} maxLength={800} className={inputCls} />
                </Field>

                <div className="border-t border-gray-100 pt-4 space-y-3">
                    <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                        <input
                            type="checkbox"
                            checked={maintenanceEnabled}
                            onChange={(e) => setMaintenanceEnabled(e.target.checked)}
                            className="rounded border-gray-300 text-primary-700 focus:ring-primary-600"
                        />
                        Mod penyelenggaraan (matikan sembang buat sementara)
                    </label>
                    <Field label="Mesej Penyelenggaraan">
                        <textarea value={maintenanceMessage} onChange={(e) => setMaintenanceMessage(e.target.value)} rows={2} maxLength={800} className={inputCls} />
                    </Field>
                </div>

                {status && <p className={banner(status)}>{status.msg}</p>}
                <div className="flex justify-end">
                    <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-semibold bg-primary-700 text-white rounded-md hover:bg-primary-800 disabled:opacity-60">
                        {saving ? 'Menyimpan…' : 'Simpan Perubahan'}
                    </button>
                </div>
            </form>
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
            {children}
        </div>
    );
}
