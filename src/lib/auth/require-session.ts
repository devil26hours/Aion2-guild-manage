/**
 * SERVER-ONLY: shared 401 response for Route Handlers. The proxy already
 * blocks unauthenticated requests; every handler re-verifies close to the data
 * (defense in depth, as recommended by the Next.js auth guide) through
 * `requireUser` / `requireGuild` in ./context.
 */

import { NextResponse } from "next/server";

if (typeof window !== "undefined") {
  throw new Error("auth/require-session is server-only.");
}

export const unauthorized = () =>
  NextResponse.json(
    { error: { code: "UNAUTHENTICATED", message: "Sign in required.", status: null } },
    { status: 401, headers: { "cache-control": "no-store" } },
  );
