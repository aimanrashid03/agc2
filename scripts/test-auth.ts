/**
 * Browser-free check of the Auth.js Credentials logic (the security-critical path):
 * looks a user up in Postgres and bcrypt-compares — exactly what auth.ts `authorize` does.
 * The full HTTP sign-in + middleware redirect flow is a browser check.
 *   npx tsx scripts/test-auth.ts
 */
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

const PG = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/postgres';

async function authorize(pool: Pool, email: string, password: string) {
    const { rows } = await pool.query(
        'SELECT id, email, name, password_hash FROM users WHERE lower(email) = $1 LIMIT 1', [email.toLowerCase()]);
    const u = rows[0];
    if (!u) return null;
    if (!(await bcrypt.compare(password, u.password_hash))) return null;
    return { id: String(u.id), email: u.email, name: u.name };
}

async function main() {
    const pool = new Pool({ connectionString: PG });

    const ok = await authorize(pool, 'admin@agc.local', 'agc12345');
    console.log('1. seeded admin + correct password ->', ok ? `OK ${JSON.stringify(ok)}` : 'FAIL (null)');

    const bad = await authorize(pool, 'admin@agc.local', 'wrong-password');
    console.log('2. seeded admin + wrong password   ->', bad === null ? 'correctly rejected (null)' : 'BUG: accepted');

    const missing = await authorize(pool, 'nobody@nowhere.local', 'whatever');
    console.log('3. unknown email                   ->', missing === null ? 'correctly rejected (null)' : 'BUG: accepted');

    // register-path: hash + insert (mirrors /api/auth/register), authorize, then clean up
    const tmp = 'tmp-authtest@agc.local';
    const hash = await bcrypt.hash('testpass123', 10);
    await pool.query(
        `INSERT INTO users (email, password_hash, name) VALUES (lower($1), $2, $3)
         ON CONFLICT (lower(email)) DO UPDATE SET password_hash = EXCLUDED.password_hash`, [tmp, hash, 'Tmp']);
    const reg = await authorize(pool, tmp, 'testpass123');
    console.log('4. registered user + correct password ->', reg ? 'OK' : 'FAIL (null)');
    await pool.query('DELETE FROM users WHERE lower(email) = lower($1)', [tmp]);
    console.log('   (cleaned up temp user)');

    await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
