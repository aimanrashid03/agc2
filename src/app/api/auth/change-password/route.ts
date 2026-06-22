import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import pool from '@/lib/db';
import { auth } from '@/auth';

// Self-service password change for a LOGGED-IN user (verifies current password).
// Forgotten-password (no session) needs an admin for now — no email infra on-prem.
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.email) {
        return NextResponse.json({ error: 'Sila log masuk dahulu.' }, { status: 401 });
    }
    const { currentPassword, newPassword } = await req.json();
    if (String(newPassword ?? '').length < 8) {
        return NextResponse.json({ error: 'Kata laluan baharu mesti sekurang-kurangnya 8 aksara.' }, { status: 400 });
    }
    const email = session.user.email.toLowerCase();
    const { rows } = await pool.query('SELECT id, password_hash FROM users WHERE lower(email) = $1', [email]);
    const u = rows[0];
    if (!u) return NextResponse.json({ error: 'Pengguna tidak ditemui.' }, { status: 404 });

    const ok = await bcrypt.compare(String(currentPassword ?? ''), u.password_hash);
    if (!ok) return NextResponse.json({ error: 'Kata laluan semasa salah.' }, { status: 400 });

    const hash = await bcrypt.hash(String(newPassword), 10);
    await pool.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, u.id]);
    return NextResponse.json({ ok: true });
}
