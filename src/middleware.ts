import { NextResponse, type NextRequest } from 'next/server';

import { refreshSession } from '@/lib/supabase/middleware';

/**
 * Two jobs, both of which have to happen before a page renders.
 *
 * 1. Keep the Supabase session alive (live mode only).
 * 2. Redirect the brief's original `/studio/:studioId` shape to the
 *    public listing at `/studios/:studioId`. It is handled here rather
 *    than as a route, because a route under `/studio` would inherit the
 *    CRM's membership guard and send an anonymous visitor to sign in
 *    instead of to the studio they asked for.
 */

/**
 * Everything under `/studio` that belongs to the owner's CRM — one entry
 * per directory in `app/studio`.
 */
const CRM_ROUTES = new Set([
  'analytics',
  'application',
  'availability',
  'bookings',
  'calendar',
  'customers',
  'listing',
  'schedule',
  'settings',
  'spaces',
  'whatsapp',
]);

/**
 * Studio identifiers, as opposed to CRM route names.
 *
 * The allowlist above has to be kept in step with the filesystem, and one
 * day it will not be. So the redirect additionally requires the segment
 * to *look like* an identifier: a slug with a hyphen, or a generated id.
 * CRM routes are single lowercase words, so a new one that nobody added
 * to the list falls through to a 404 — which is a visible, obvious bug —
 * rather than silently redirecting an owner to a public page, which is a
 * confusing and invisible one.
 */
const LOOKS_LIKE_STUDIO_ID =
  /^(?:[a-z0-9]+-[a-z0-9-]+|stu_[A-Za-z0-9_-]+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const legacy = /^\/studio\/([^/]+)\/?$/.exec(pathname);
  const segment = legacy?.[1];

  if (segment && !CRM_ROUTES.has(segment) && LOOKS_LIKE_STUDIO_ID.test(segment)) {
    const url = request.nextUrl.clone();
    url.pathname = `/studios/${segment}`;
    /*
      307, not 308. A permanent redirect is cached by the browser
      forever, so if this rule ever matches a path that later becomes a
      real CRM route, every browser that saw it keeps redirecting and no
      deploy can fix them. A compatibility shim should not be able to
      outlive its own mistake.
    */
    return NextResponse.redirect(url, 307);
  }

  return refreshSession(request, NextResponse.next({ request }));
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image optimisation, which
     * never need a session and would only add latency.
     */
    '/((?!_next/static|_next/image|favicon.ico|uploads|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif)$).*)',
  ],
};
