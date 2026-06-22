import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { auth } from '@/auth';

// Self-service profile update for the LOGGED-IN user (display name only; email is the identity key).
export const runtime = 'nodejs';

export async function PATCH(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.email) {
        return NextResponse.json({ error: 'Sila log masuk dahulu.' }, { status: 401 });
    }
    const { name } = await req.json();
    const n = String(name ?? '').trim();
    if (!n) {
        return NextResponse.json({ error: 'Nama tidak boleh kosong.' }, { status: 400 });
    }
    await pool.query('UPDATE users SET name = $1, updated_at = NOW() WHERE lower(email) = $2',
        [n, session.user.email.toLowerCase()]);
    return NextResponse.json({ ok: true, name: n });
}
