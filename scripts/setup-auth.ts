/**
 * Idempotent auth setup: creates the `users` table for Auth.js Credentials login
 * WITHOUT touching the case data (unlike setup-db.ts, which drops everything).
 * Optionally seeds/updates a user.
 *
 *   npx tsx scripts/setup-auth.ts
 *   npx tsx scripts/setup-auth.ts --seed admin@agc.local agc12345 "Admin" admin
 *   npx tsx scripts/setup-auth.ts --promote admin@agc.local   # make an existing user an admin
 *
 * --seed <email> <password> [name] [role]   role defaults to 'officer'
 * --promote <email>                          set role='admin' on an existing user (bootstrap first admin)
 */
import { Pool } from 'pg';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const PG = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/postgres';

async function main() {
    const pool = new Pool({ connectionString: PG });
    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            email TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            name TEXT,
            role TEXT NOT NULL DEFAULT 'officer',
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        );
    `);
    // Case-insensitive unique email (the app stores+queries lower(email)).
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email));`);
    console.log('users table + unique index ready');

    const args = process.argv.slice(2);
    const si = args.indexOf('--seed');
    if (si >= 0) {
        const email = args[si + 1], password = args[si + 2], name = args[si + 3] || null;
        const role = args[si + 4] && !args[si + 4].startsWith('--') ? args[si + 4] : 'officer';
        if (!email || !password) { console.error('--seed needs <email> <password> [name] [role]'); process.exit(1); }
        const bcrypt = (await import('bcryptjs')).default;
        const hash = await bcrypt.hash(password, 10);
        await pool.query(
            `INSERT INTO users (email, password_hash, name, role) VALUES (lower($1), $2, $3, $4)
             ON CONFLICT (lower(email)) DO UPDATE SET password_hash = EXCLUDED.password_hash, name = EXCLUDED.name, role = EXCLUDED.role, updated_at = NOW()`,
            [email, hash, name, role]);
        console.log(`seeded/updated user: ${email.toLowerCase()} (role: ${role})`);
    }

    const pi = args.indexOf('--promote');
    if (pi >= 0) {
        const email = args[pi + 1];
        if (!email) { console.error('--promote needs <email>'); process.exit(1); }
        const { rowCount } = await pool.query(
            `UPDATE users SET role = 'admin', updated_at = NOW() WHERE lower(email) = lower($1)`, [email]);
        console.log(rowCount ? `promoted to admin: ${email.toLowerCase()}` : `no user found: ${email.toLowerCase()}`);
    }

    const { rows } = await pool.query('SELECT count(*)::int AS n FROM users');
    console.log(`total users: ${rows[0].n}`);
    await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
