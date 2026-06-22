import type { NextAuthConfig } from 'next-auth';

/**
 * Edge-safe Auth.js config — NO bcrypt/pg imports, so it can run in middleware
 * (Edge runtime). The Credentials provider (which needs Node) is added in auth.ts.
 * Default jwt/session handling is fine (no roles in the app yet — add a `role`
 * callback + type augmentation here if RBAC is introduced later).
 */
export const authConfig = {
    pages: { signIn: '/auth/login' },
    session: { strategy: 'jwt' },
    providers: [],
} satisfies NextAuthConfig;
