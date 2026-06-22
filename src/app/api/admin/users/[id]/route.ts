import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getAdminSession } from '@/lib/auth-guard';

// Admin-only: update (name/role) or delete a single user.
export const runtime = 'nodejs';

const VALID_ROLES = ['officer', 'admin'];

async function adminCount(): Promise<number> {
    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM users WHERE role = 'admin'`);
    return rows[0].n;
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const session = await getAdminSession();
    if (!session) return NextResponse.json({ error: 'Akses dilarang.' }, { status: 403 });

    const { id } = await ctx.params;
    const targetId = Number(id);
    if (!Number.isInteger(targetId)) {
        return NextResponse.json({ error: 'ID pengguna tidak sah.' }, { status: 400 });
    }

    const body = await req.json();
    const updates: string[] = [];
    const values: unknown[] = [];

    if (typeof body.name === 'string') {
        values.push(body.name.trim() || null);
        updates.push(`name = $${values.length}`);
    }

    if (typeof body.role === 'string') {
        if (!VALID_ROLES.includes(body.role)) {
            return NextResponse.json({ error: 'Peranan tidak sah.' }, { status: 400 });
        }
        // Guard: don't change your own role; don't demote the last admin.
        const isSelf = String(targetId) === String(session.user?.id);
        if (isSelf && body.role !== 'admin') {
            return NextResponse.json({ error: 'Anda tidak boleh menukar peranan akaun sendiri.' }, { status: 400 });
        }
        if (body.role !== 'admin') {
            const { rows } = await pool.query('SELECT role FROM users WHERE id = $1', [targetId]);
            if (rows[0]?.role === 'admin' && (await adminCount()) <= 1) {
                return NextResponse.json({ error: 'Tidak boleh menurunkan pentadbir terakhir.' }, { status: 400 });
            }
        }
        values.push(body.role);
        updates.push(`role = $${values.length}`);
    }

    if (updates.length === 0) {
        return NextResponse.json({ error: 'Tiada perubahan diberikan.' }, { status: 400 });
    }

    values.push(targetId);
    const { rows } = await pool.query(
        `UPDATE users SET ${updates.join(', ')}, updated_at = NOW()
         WHERE id = $${values.length}
         RETURNING id, email, name, role, created_at`,
        values);
    if (!rows[0]) return NextResponse.json({ error: 'Pengguna tidak ditemui.' }, { status: 404 });
    return NextResponse.json({ user: rows[0] });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const session = await getAdminSession();
    if (!session) return NextResponse.json({ error: 'Akses dilarang.' }, { status: 403 });

    const { id } = await ctx.params;
    const targetId = Number(id);
    if (!Number.isInteger(targetId)) {
        return NextResponse.json({ error: 'ID pengguna tidak sah.' }, { status: 400 });
    }
    if (String(targetId) === String(session.user?.id)) {
        return NextResponse.json({ error: 'Anda tidak boleh memadam akaun sendiri.' }, { status: 400 });
    }

    const { rows } = await pool.query('SELECT role FROM users WHERE id = $1', [targetId]);
    if (!rows[0]) return NextResponse.json({ error: 'Pengguna tidak ditemui.' }, { status: 404 });
    if (rows[0].role === 'admin' && (await adminCount()) <= 1) {
        return NextResponse.json({ error: 'Tidak boleh memadam pentadbir terakhir.' }, { status: 400 });
    }

    await pool.query('DELETE FROM users WHERE id = $1', [targetId]);
    return NextResponse.json({ ok: true });
}
