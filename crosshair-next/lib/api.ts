import "server-only";
import { NextResponse } from "next/server";

/** Map thrown errors to clean responses. Never leak internals or secrets. */
export function errorResponse(err: unknown): NextResponse {
  const message = err instanceof Error ? err.message : "Unexpected error";
  if (message === "UNAUTHENTICATED") {
    return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  }
  if (message === "NO_ORG") {
    return NextResponse.json({ error: "No workspace found for this account." }, { status: 403 });
  }
  if (/API_KEY (is not set|was rejected)/.test(message)) {
    return NextResponse.json({ error: `AI is not configured: ${message}` }, { status: 503 });
  }
  if (message.includes("rate limit")) {
    return NextResponse.json({ error: message }, { status: 429 });
  }
  if (err instanceof Error && err.name === "AbortError") {
    return NextResponse.json({ error: "The AI call timed out. Try again." }, { status: 504 });
  }
  console.error("[crosshair]", message);
  return NextResponse.json({ error: message }, { status: 500 });
}
