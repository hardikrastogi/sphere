import { NextRequest, NextResponse } from 'next/server';

const protectedPaths = ['/home', '/explore', '/notifications', '/profile', '/chat', '/create', '/create-story'];
const authPaths = ['/login', '/signup'];

export function middleware(request: NextRequest) {
  const token = request.cookies.get('token')?.value;
  const { pathname } = request.nextUrl;

  const isProtected = protectedPaths.some((path) => pathname.startsWith(path));
  const isAuthPage = authPaths.some((path) => pathname.startsWith(path));

  // Bare "/" (still the untouched create-next-app starter page) should never render -
  // send people straight to wherever they actually belong.
  if (pathname === '/') {
    return NextResponse.redirect(new URL(token ? '/home' : '/login', request.url));
  }

  if (isProtected && !token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (isAuthPage && token) {
    return NextResponse.redirect(new URL('/home', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/create-story/:path*','/home/:path*', '/create/:path*', '/explore/:path*', '/notifications/:path*', '/profile/:path*', '/chat/:path*', '/login', '/signup'],
};
