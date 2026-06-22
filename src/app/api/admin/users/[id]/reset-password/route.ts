import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import pool from '@/lib/db';
import { getAdminSession } from '@/lib/auth-guard';

// Admin-only: set a new password for any user (no current-password check; no email infra on-prem).
export const runtime = 'nodejs';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    if (!(await getAdminSession())) {
        return NextResponse.json({ error: 'Akses dilarang.' }, { status: 403 });
    }
    const { id } = await ctx.params;
    const targetId = Number(id);
    if (!Number.isInteger(targetId)) {
        return NextResponse.json({ error: 'ID pengguna tidak sah.' }, { status: 400 });
    }
    const { newPassword } = await req.json();
    if (String(newPassword ?? '').length < 8) {
        return NextResponse.json({ error: 'Kata laluan baharu mesti sekurang-kurangnya 8 aksara.' }, { status: 400 });
    }
    const hash = await bcrypt.hash(String(newPassword), 10);
    const { rowCount } = await pool.query(
        'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, targetId]);
    if (!rowCount) return NextResponse.json({ error: 'Pengguna tidak ditemui.' }, { status: 404 });
    return NextResponse.json({ ok: true });
}
