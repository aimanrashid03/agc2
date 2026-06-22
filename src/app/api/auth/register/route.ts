import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import pool from '@/lib/db';

// Self-service sign-up for LOCAL DEV (auto-confirm, no email). On the VM this should
// likely become admin-provisioned — see the "DECIDE AT VM SETUP" note in docs/on-prem-migration.md.
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
    try {
        const { email, password, name } = await req.json();
        const e = String(email ?? '').toLowerCase().trim();
        if (!e || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) {
            return NextResponse.json({ error: 'Emel tidak sah.' }, { status: 400 });
        }
        if (String(password ?? '').length < 8) {
            return NextResponse.json({ error: 'Kata laluan mesti sekurang-kurangnya 8 aksara.' }, { status: 400 });
        }
        const hash = await bcrypt.hash(String(password), 10);
        try {
            await pool.query('INSERT INTO users (email, password_hash, name) VALUES (lower($1), $2, $3)',
                [e, hash, name ? String(name) : null]);
        } catch (err: unknown) {
            if ((err as { code?: string })?.code === '23505') {
                return NextResponse.json({ error: 'Emel ini telah didaftarkan.' }, { status: 409 });
            }
            throw err;
        }
        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error('register error', err);
        return NextResponse.json({ error: 'Pendaftaran gagal.' }, { status: 500 });
    }
}
