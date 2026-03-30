import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables.');
}

const AUTH_PREFIX = '/auth';
const PUBLIC_PATHS = ['/auth/login', '/auth/sign-up', '/auth/forgot-password', '/auth/reset-password'];
const GUEST_ONLY_AUTH_PATHS = ['/auth/login', '/auth/sign-up'];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function isGuestOnlyAuthPath(pathname: string) {
  return GUEST_ONLY_AUTH_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request,
  });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));

        response = NextResponse.next({
          request,
        });

        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options as CookieOptions),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isAuthRoute = pathname.startsWith(AUTH_PREFIX);
  const pathIsPublic = isPublicPath(pathname);

  if (!user && !pathIsPublic && !isAuthRoute) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/auth/login';
    redirectUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && isAuthRoute && isGuestOnlyAuthPath(pathname)) {
    const nextPath = request.nextUrl.searchParams.get('next') || '/';
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = nextPath;
    redirectUrl.search = '';
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}
