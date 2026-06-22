import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getAdminSession } from '@/lib/auth-guard';

// Admin-only avatar upload. Stores bytes in Postgres (chatbot_settings.avatar_data) so it
// survives restarts and works on any host (no runtime writes to /public). Served back by
// the public GET /api/chatbot/avatar. Multipart form field name: "avatar".
export const runtime = 'nodejs';

const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_BYTES = 1024 * 1024; // 1 MB

export async function POST(req: NextRequest) {
    if (!(await getAdminSession())) {
        return NextResponse.json({ error: 'Akses dilarang.' }, { status: 403 });
    }
    try {
        const form = await req.formData();
        const file = form.get('avatar');
        if (!(file instanceof Blob)) {
            return NextResponse.json({ error: 'Tiada fail dimuat naik.' }, { status: 400 });
        }
        if (!ALLOWED.has(file.type)) {
            return NextResponse.json({ error: 'Format imej mesti PNG, JPEG, atau WEBP.' }, { status: 400 });
        }
        if (file.size === 0) {
            return NextResponse.json({ error: 'Fail kosong.' }, { status: 400 });
        }
        if (file.size > MAX_BYTES) {
            return NextResponse.json({ error: 'Saiz imej melebihi 1 MB.' }, { status: 400 });
        }
        const buf = Buffer.from(await file.arrayBuffer());
        await pool.query(
            `INSERT INTO chatbot_settings (id, avatar_data, avatar_mime, avatar_updated_at, updated_at)
             VALUES (1, $1, $2, NOW(), NOW())
             ON CONFLICT (id) DO UPDATE SET
                avatar_data = EXCLUDED.avatar_data,
                avatar_mime = EXCLUDED.avatar_mime,
                avatar_updated_at = NOW(),
                updated_at = NOW()`,
            [buf, file.type]);
        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error('upload avatar error', err);
        return NextResponse.json({ error: 'Gagal memuat naik imej.' }, { status: 500 });
    }
}
