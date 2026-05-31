import { NextRequest, NextResponse } from 'next/server';

const isPublicRoute = (pathname: string) => {
  const publicRoutes = [
    '/',
    '/sign-in',
    '/sign-up',
    '/onboarding',
    '/api/webhooks',
    '/_next',
  ];
  return publicRoutes.some(route => pathname.startsWith(route)) || pathname.includes('.');
};

export function middleware(request: NextRequest) {
  // For now, allow all requests through (auth disabled for development)
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
