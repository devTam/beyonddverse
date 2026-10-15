import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";
import { enforceRateLimit, RateLimitError } from "@/lib/security/rate-limit";

const handlers = toNextJsHandler(auth);
export const GET = handlers.GET;
export async function POST(request: Request) {
  try { await enforceRateLimit(request, "auth", 10, 60); }
  catch (error) { if (error instanceof RateLimitError) return new Response(error.message, { status: 429, headers: { "retry-after": String(error.retryAfter) } }); throw error; }
  return handlers.POST(request);
}
