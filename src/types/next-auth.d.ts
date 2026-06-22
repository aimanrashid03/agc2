import type { DefaultSession } from 'next-auth';
import 'next-auth/jwt';

/**
 * Module augmentation so TypeScript (strict) knows about the custom `role`/`id`
 * fields we carry through the JWT and session (see src/auth.config.ts callbacks).
 * Effective roles: 'officer' (default) | 'admin'.
 */
declare module 'next-auth' {
    interface User {
        role?: string;
    }
    interface Session {
        user: {
            id?: string;
            role?: string;
        } & DefaultSession['user'];
    }
}

declare module 'next-auth/jwt' {
    interface JWT {
        role?: string;
        uid?: string;
    }
}
