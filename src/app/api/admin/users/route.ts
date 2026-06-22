import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import pool from '@/lib/db';
import { getAdminSession } from '@/lib/auth-guard';

// Admin-only user management. GET = list, POST = create.
export const runtime = 'nodejs';

const VALID_ROLES = ['officer', 'admin'];

export async function GET() {
    if (!(await getAdminSession())) {
        return NextResponse.json({ error: 'Akses dilarang.' }, { status: 403 });
    }
    const { rows } = await pool.query(
        'SELECT id, email, name, role, created_at FROM users ORDER BY created_at ASC, id ASC');
    return NextResponse.json({ users: rows });
}

export async function POST(req: NextRequest) {
    if (!(await getAdminSession())) {
        return NextResponse.json({ error: 'Akses dilarang.' }, { status: 403 });
    }
    try {
        const { email, password, name, role } = await req.json();
        const e = String(email ?? '').toLowerCase().trim();
        if (!e || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) {
            return NextResponse.json({ error: 'Emel tidak sah.' }, { status: 400 });
        }
        if (String(password ?? '').length < 8) {
            return NextResponse.json({ error: 'Kata laluan mesti sekurang-kurangnya 8 aksara.' }, { status: 400 });
        }
        const r = VALID_ROLES.includes(role) ? role : 'officer';
        const hash = await bcrypt.hash(String(password), 10);
        try {
            const { rows } = await pool.query(
                `INSERT INTO users (email, password_hash, name, role)
                 VALUES (lower($1), $2, $3, $4)
                 RETURNING id, email, name, role, created_at`,
                [e, hash, name ? String(name).trim() : null, r]);
            return NextResponse.json({ user: rows[0] }, { status: 201 });
        } catch (err: unknown) {
            if ((err as { code?: string })?.code === '23505') {
                return NextResponse.json({ error: 'Emel ini telah didaftarkan.' }, { status: 409 });
            }
            throw err;
        }
    } catch (err) {
        console.error('admin create user error', err);
        return NextResponse.json({ error: 'Gagal menambah pengguna.' }, { status: 500 });
    }
}
