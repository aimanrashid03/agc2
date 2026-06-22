import type { NextAuthConfig } from 'next-auth';

/**
 * Edge-safe Auth.js config — NO bcrypt/pg imports, so it can run in middleware
 * (Edge runtime). The Credentials provider (which needs Node) is added in auth.ts.
 * The jwt/session callbacks carry `role` + `id` so RBAC works at the edge (proxy.ts
 * gate) and on the client (Sidebar `useSession`). Type augmentation in src/types/next-auth.d.ts.
 */
export const authConfig = {
    pages: { signIn: '/auth/login' },
    session: { strategy: 'jwt' },
    providers: [],
    callbacks: {
        jwt({ token, user, trigger, session }) {
            // On sign-in `user` is the object returned by authorize() (has role + id).
            if (user) {
                token.role = user.role ?? 'officer';
                token.uid = user.id;
            }
            // Live profile rename from Settings (useSession().update({ name })).
            if (trigger === 'update' && session?.name) {
                token.name = session.name as string;
            }
            return token;
        },
        session({ session, token }) {
            if (session.user) {
                session.user.role = (token.role as string) ?? 'officer';
                session.user.id = (token.uid as string) ?? session.user.id;
            }
            return session;
        },
    },
} satisfies NextAuthConfig;
