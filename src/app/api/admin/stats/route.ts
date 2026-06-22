import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getAdminSession } from '@/lib/auth-guard';

// Admin-only: read-only system overview counts for the "Sistem" tab.
export const runtime = 'nodejs';

export async function GET() {
    if (!(await getAdminSession())) {
        return NextResponse.json({ error: 'Akses dilarang.' }, { status: 403 });
    }
    const [users, cases, embeddings, folders] = await Promise.all([
        pool.query(`SELECT role, count(*)::int AS n FROM users GROUP BY role`),
        pool.query(`SELECT count(*)::int AS n FROM cases`),
        pool.query(`SELECT count(*)::int AS n FROM case_embeddings`),
        pool.query(`SELECT count(DISTINCT source_folder)::int AS n FROM cases WHERE source_folder IS NOT NULL`),
    ]);

    const byRole: Record<string, number> = {};
    let totalUsers = 0;
    for (const r of users.rows) {
        byRole[r.role] = r.n;
        totalUsers += r.n;
    }

    return NextResponse.json({
        users: {
            total: totalUsers,
            admin: byRole.admin ?? 0,
            officer: byRole.officer ?? 0,
        },
        cases: cases.rows[0].n,
        embeddings: embeddings.rows[0].n,
        folders: folders.rows[0].n,
    });
}
