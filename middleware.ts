import { type NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { updateSession } from "@/lib/supabase/middleware";
import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);

export async function middleware(request: NextRequest) {
  // 1. Handle i18n routing first
  const intlResponse = intlMiddleware(request);

  // 2. Handle Supabase session refresh + auth guards
  return updateSession(request);
}

export const config = {
  matcher: [
    // Match all pathnames except static files and Next.js internals
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
