import { LookupError, extractPageId, lookupPage } from "./notion";
import type { ErrorResponse, LookupResponse } from "./types";

const CACHE_TTL_SECONDS = 60 * 60;
const MAX_LOOKUP_BODY_BYTES = 4 * 1024;
const RATE_LIMITS = [
  { name: "minute", windowSeconds: 60, max: 10 },
  { name: "hour", windowSeconds: 60 * 60, max: 50 }
] as const;
const SECURITY_HEADERS: HeadersInit = {
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY"
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (!url.pathname.startsWith("/api/")) {
      if ((request.method === "GET" || request.method === "HEAD") && env.ASSETS) {
        return env.ASSETS.fetch(request);
      }

      return jsonError(404, "not_found", "Not found.", request, env);
    }

    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({ ok: true, service: "notionpeek" }, 200, request, env);
    }

    if (url.pathname !== "/api/lookup") {
      return jsonError(404, "not_found", "Not found.", request, env);
    }

    if (request.method === "OPTIONS") {
      return handleOptions(request, env);
    }

    if (request.method !== "POST" && request.method !== "GET") {
      return jsonError(405, "method_not_allowed", "Use POST /api/lookup.", request, env, {
        Allow: "POST, GET, OPTIONS"
      });
    }

    if (!isAllowedAppRequest(request, env)) {
      return jsonError(403, "forbidden", "Requests must come from the NotionPeek app.", request, env);
    }

    try {
      await enforceRateLimit(request, env);

      const notionUrl = request.method === "GET" ? url.searchParams.get("url") : await readLookupUrl(request);
      if (!notionUrl) {
        return jsonError(400, "missing_url", "Missing Notion URL.", request, env);
      }

      const pageId = extractPageId(notionUrl);
      if (!pageId) {
        throw new LookupError(400, "invalid_url", "That doesn't look like a Notion link.");
      }

      const cached = await readCache(pageId, env);
      if (cached) {
        return json({ ...cached, cached: true }, 200, request, env, {
          "Cache-Control": "private, max-age=60",
          "X-NotionPeek-Cache": "hit"
        });
      }

      const result = await lookupPage(notionUrl);
      ctx.waitUntil(writeCache(result, env));
      return json(result, 200, request, env, {
        "Cache-Control": "private, max-age=60",
        "X-NotionPeek-Cache": "miss"
      });
    } catch (error) {
      if (error instanceof LookupError) {
        return jsonError(error.status, error.code, error.message, request, env);
      }

      return jsonError(500, "internal_error", "Something went wrong.", request, env);
    }
  }
};

async function readLookupUrl(request: Request): Promise<string | null> {
  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return null;
  }

  const declaredLength = Number(request.headers.get("Content-Length") ?? "0");
  if (declaredLength > MAX_LOOKUP_BODY_BYTES) {
    throw new LookupError(413, "payload_too_large", "Lookup requests must be smaller than 4 KB.");
  }

  const bodyText = await request.text().catch(() => null);
  if (bodyText === null) {
    return null;
  }

  if (byteLength(bodyText) > MAX_LOOKUP_BODY_BYTES) {
    throw new LookupError(413, "payload_too_large", "Lookup requests must be smaller than 4 KB.");
  }

  const body = parseJsonObject(bodyText);
  return typeof body?.url === "string" ? body.url : null;
}

async function readCache(pageId: string, env: Env): Promise<LookupResponse | null> {
  const cached = await env.CACHE?.get(cacheKey(pageId), "json");
  return isLookupResponse(cached) ? cached : null;
}

async function writeCache(result: LookupResponse, env: Env): Promise<void> {
  await env.CACHE?.put(cacheKey(result.pageId), JSON.stringify(result), {
    expirationTtl: CACHE_TTL_SECONDS
  });
}

async function enforceRateLimit(request: Request, env: Env): Promise<void> {
  const kv = env.RATE_LIMIT ?? env.CACHE;
  if (!kv) {
    return;
  }

  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const identity = await hashRateLimitIdentity(ip);
  const now = Math.floor(Date.now() / 1000);

  for (const limit of RATE_LIMITS) {
    const windowId = Math.floor(now / limit.windowSeconds);
    const key = `rate:${limit.name}:${identity}:${windowId}`;
    const current = Number((await kv.get(key)) ?? "0");

    if (current >= limit.max) {
      throw new LookupError(429, "rate_limited", "Too many requests. Try again in a minute.");
    }

    await kv.put(key, String(current + 1), {
      expirationTtl: limit.windowSeconds + 30
    });
  }
}

function isAllowedAppRequest(request: Request, env: Env): boolean {
  const requireReferer = env.REQUIRE_APP_REFERER !== "false";
  if (!requireReferer) {
    return true;
  }

  const requestOrigin = new URL(request.url).origin;
  const allowLocalOrigins = shouldAllowLocalOrigins(env, requestOrigin);
  const allowedOrigins = new Set([requestOrigin, ...parseAllowedOrigins(env.ALLOWED_ORIGINS)]);
  const origin = request.headers.get("Origin");
  const referer = request.headers.get("Referer");

  if (origin && isAllowedOrigin(origin, allowedOrigins, allowLocalOrigins)) {
    return true;
  }

  if (referer) {
    try {
      return isAllowedOrigin(new URL(referer).origin, allowedOrigins, allowLocalOrigins);
    } catch {
      return false;
    }
  }

  return isLocalRequest(requestOrigin);
}

function parseAllowedOrigins(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map(normalizeOrigin)
    .filter((origin): origin is string => Boolean(origin));
}

function isAllowedOrigin(origin: string, allowedOrigins: Set<string>, allowLocalOrigins: boolean): boolean {
  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) {
    return false;
  }

  return allowedOrigins.has(normalizedOrigin) || (allowLocalOrigins && isLocalRequest(normalizedOrigin));
}

function isLocalRequest(origin: string): boolean {
  try {
    const hostname = new URL(origin).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".localhost");
  } catch {
    return false;
  }
}

function shouldAllowLocalOrigins(env: Env, requestOrigin: string): boolean {
  return env.ALLOW_LOCAL_ORIGINS === "true" || isLocalRequest(requestOrigin);
}

function normalizeOrigin(origin: string): string | null {
  try {
    const parsed = new URL(origin.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    return parsed.origin;
  } catch {
    return null;
  }
}

function handleOptions(request: Request, env: Env): Response {
  if (!isAllowedAppRequest(request, env)) {
    return jsonError(403, "forbidden", "Requests must come from the NotionPeek app.", request, env);
  }

  return new Response(null, {
    status: 204,
    headers: {
      ...SECURITY_HEADERS,
      ...corsHeaders(request, env)
    }
  });
}

function json<T>(body: T, status: number, request: Request, env: Env, extraHeaders: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...SECURITY_HEADERS,
      ...corsHeaders(request, env),
      ...extraHeaders
    }
  });
}

function jsonError(
  status: number,
  code: string,
  message: string,
  request: Request,
  env: Env,
  extraHeaders: HeadersInit = {}
): Response {
  const body: ErrorResponse = { error: { code, message } };
  return json(body, status, request, env, extraHeaders);
}

function corsHeaders(request: Request, env: Env): HeadersInit {
  const origin = request.headers.get("Origin");
  const requestOrigin = new URL(request.url).origin;
  const allowedOrigins = new Set([requestOrigin, ...parseAllowedOrigins(env.ALLOWED_ORIGINS)]);

  if (!origin || !isAllowedOrigin(origin, allowedOrigins, shouldAllowLocalOrigins(env, requestOrigin))) {
    return {};
  }

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Vary": "Origin"
  };
}

function cacheKey(pageId: string): string {
  return `page:${pageId}`;
}

async function hashRateLimitIdentity(identity: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function parseJsonObject(value: string): { url?: unknown } | null {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as { url?: unknown }) : null;
  } catch {
    return null;
  }
}

function isLookupResponse(value: unknown): value is LookupResponse {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as LookupResponse).pageId === "string" &&
      Array.isArray((value as LookupResponse).collaborators) &&
      typeof (value as LookupResponse).timestamp === "string"
  );
}
