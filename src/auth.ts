import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import pool from '@/lib/db';
import { authConfig } from '@/auth.config';

/**
 * Full Auth.js instance (Node runtime — uses pg + bcrypt). Used by the route handler
 * and server-side `auth()`. Middleware uses the Edge-safe authConfig instead.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
    ...authConfig,
    providers: [
        Credentials({
            credentials: { email: {}, password: {} },
            async authorize(creds) {
                const email = String(creds?.email ?? '').toLowerCase().trim();
                const password = String(creds?.password ?? '');
                if (!email || !password) return null;

                const { rows } = await pool.query(
                    'SELECT id, email, name, password_hash FROM users WHERE lower(email) = $1 LIMIT 1',
                    [email]);
                const u = rows[0];
                if (!u) return null;

                const ok = await bcrypt.compare(password, u.password_hash);
                if (!ok) return null;

                return { id: String(u.id), email: u.email, name: u.name ?? undefined };
            },
        }),
    ],
});
