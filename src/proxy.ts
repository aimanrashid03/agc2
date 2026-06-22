import NextAuth from 'next-auth';
import { authConfig } from '@/auth.config';

// Route gate (Next.js 16 "proxy" convention — renamed from middleware). Edge-safe:
// authConfig has no Node deps. In a `src/` project this MUST live at src/proxy.ts.
const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = ['/auth/login', '/auth/sign-up', '/auth/forgot-password', '/auth/reset-password'];
const GUEST_ONLY = ['/auth/login', '/auth/sign-up'];
const matches = (list: string[], p: string) => list.some((x) => p === x || p.startsWith(`${x}/`));

export default auth((req) => {
  const { nextUrl } = req;
  const path = nextUrl.pathname;
  const isLoggedIn = !!req.auth;
  const isAuthRoute = path.startsWith('/auth');

  // Unauthenticated + protected page -> login (preserve intended destination)
  if (!isLoggedIn && !matches(PUBLIC_PATHS, path) && !isAuthRoute) {
    const url = new URL('/auth/login', nextUrl);
    url.searchParams.set('next', path);
    return Response.redirect(url);
  }
  // Logged-in user on login/sign-up -> bounce to intended destination or home
  if (isLoggedIn && matches(GUEST_ONLY, path)) {
    const next = nextUrl.searchParams.get('next') || '/';
    return Response.redirect(new URL(next, nextUrl));
  }
  // otherwise continue
});

export const config = {
  // Everything except Next internals, images, and the NextAuth API routes
  // (/api/auth/* must stay ungated or sign-in itself would be redirected).
  matcher: [
    '/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
