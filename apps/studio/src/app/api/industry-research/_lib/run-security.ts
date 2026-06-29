import { Buffer } from "node:buffer";
import { randomBytes } from "node:crypto";
import {
  ALLOWED_HOSTS_ENV,
  ALLOWED_ORIGINS_ENV,
  RUN_STREAM_MAX_BODY_BYTES_ENV,
  RUN_STREAM_RATE_LIMIT_ENV,
  RUN_STREAM_TIMEOUT_MS_ENV,
} from "./server-env";

const DEFAULT_ALLOWED_ORIGIN = "https://research.playgamelab.cn";
const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_MAX_BODY_BYTES = 256_000;
const DEFAULT_MAX_RUNS_PER_IP_PER_HOUR = 10;
const TOKEN_TTL_MS = 10 * 60 * 1000;

const issuedTokens = new Map<string, number>();
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

export class RunSecurityError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

function splitEnvList(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function numberEnv(
  env: Record<string, string | undefined>,
  key: string,
  fallback: number,
) {
  const value = Number(env[key]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function hostFromUrl(value: string | undefined) {
  if (!value) return undefined;
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return undefined;
  }
}

function allowedOrigins(env: Record<string, string | undefined>) {
  const origins = new Set([
    DEFAULT_ALLOWED_ORIGIN,
    ...splitEnvList(env[ALLOWED_ORIGINS_ENV]),
  ]);

  for (const key of ["AGENT_FACTORY_BASE_URL", "NEXT_PUBLIC_APP_URL"]) {
    const value = env[key]?.trim();
    if (value) origins.add(value.replace(/\/$/, ""));
  }

  if (env.NODE_ENV !== "production") {
    origins.add("http://localhost:3000");
    origins.add("http://127.0.0.1:3000");
  }

  return origins;
}

function allowedHosts(env: Record<string, string | undefined>) {
  const hosts = new Set(
    splitEnvList(env[ALLOWED_HOSTS_ENV]).map((host) => host.toLowerCase()),
  );

  for (const origin of allowedOrigins(env)) {
    const host = hostFromUrl(origin);
    if (host) hosts.add(host);
  }

  if (env.NODE_ENV !== "production") {
    hosts.add("localhost:3000");
    hosts.add("127.0.0.1:3000");
  }

  return hosts;
}

function requestHost(request: Request) {
  return (
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    request.headers.get("host") ||
    ""
  ).toLowerCase();
}

function requestIp(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function cleanupTokens(now = Date.now()) {
  for (const [token, expiresAt] of issuedTokens.entries()) {
    if (expiresAt <= now) {
      issuedTokens.delete(token);
    }
  }
}

export function issueRunStreamToken() {
  cleanupTokens();
  const token = randomBytes(24).toString("base64url");
  issuedTokens.set(token, Date.now() + TOKEN_TTL_MS);
  return { token, expiresInMs: TOKEN_TTL_MS };
}

function consumeRunStreamToken(request: Request) {
  cleanupTokens();
  const token = request.headers.get("x-industry-research-run-token")?.trim();

  if (!token) {
    throw new RunSecurityError("缺少 run token。", 403);
  }

  const expiresAt = issuedTokens.get(token);
  issuedTokens.delete(token);

  if (!expiresAt || expiresAt <= Date.now()) {
    throw new RunSecurityError("run token 无效或已过期。", 403);
  }
}

function validateOriginAndHost(
  request: Request,
  env: Record<string, string | undefined>,
) {
  const host = requestHost(request);
  const hosts = allowedHosts(env);

  if (!host || !hosts.has(host)) {
    throw new RunSecurityError("Host 不在允许列表。", 403);
  }

  const origin = request.headers.get("origin")?.replace(/\/$/, "");
  const origins = allowedOrigins(env);

  if (origin && !origins.has(origin)) {
    throw new RunSecurityError("Origin 不在允许列表。", 403);
  }

  if (!origin && env.NODE_ENV === "production" && request.method === "POST") {
    throw new RunSecurityError("生产环境 run 请求必须携带 Origin。", 403);
  }
}

function enforceRateLimit(
  request: Request,
  env: Record<string, string | undefined>,
) {
  const limit = numberEnv(
    env,
    RUN_STREAM_RATE_LIMIT_ENV,
    DEFAULT_MAX_RUNS_PER_IP_PER_HOUR,
  );
  const now = Date.now();
  const ip = requestIp(request);
  const current = rateLimitBuckets.get(ip);

  if (!current || current.resetAt <= now) {
    rateLimitBuckets.set(ip, {
      count: 1,
      resetAt: now + 60 * 60 * 1000,
    });
    return;
  }

  if (current.count >= limit) {
    throw new RunSecurityError("run 请求过于频繁，请稍后再试。", 429);
  }

  current.count += 1;
}

export function validateRunStreamTokenRequest(
  request: Request,
  env: Record<string, string | undefined>,
) {
  validateOriginAndHost(request, env);
}

export function validateRunStreamPostRequest(
  request: Request,
  env: Record<string, string | undefined>,
) {
  validateOriginAndHost(request, env);
  consumeRunStreamToken(request);
  enforceRateLimit(request, env);
}

export async function readJsonBodyWithLimit(
  request: Request,
  env: Record<string, string | undefined>,
) {
  const maxBytes = numberEnv(
    env,
    RUN_STREAM_MAX_BODY_BYTES_ENV,
    DEFAULT_MAX_BODY_BYTES,
  );
  const contentLength = Number(request.headers.get("content-length") ?? 0);

  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new RunSecurityError("请求体超过大小上限。", 413);
  }

  const rawBody = await request.text();

  if (Buffer.byteLength(rawBody, "utf8") > maxBytes) {
    throw new RunSecurityError("请求体超过大小上限。", 413);
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    throw new RunSecurityError("请求体不是合法 JSON。", 400);
  }
}

export function runTimeoutMs(env: Record<string, string | undefined>) {
  return numberEnv(env, RUN_STREAM_TIMEOUT_MS_ENV, DEFAULT_TIMEOUT_MS);
}

export function sanitizeRunError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error);

  return raw
    .replace(/api key:\s*[^,\s]+/gi, "api key: [redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(
      /SUPABASE_SERVICE_ROLE_KEY=[^\s]+/gi,
      "SUPABASE_SERVICE_ROLE_KEY=[redacted]",
    )
    .replace(/\/Users\/[^\s)]+/g, "[local-path]")
    .replace(/\/opt\/[^\s)]+/g, "[server-path]")
    .replace(/\/var\/[^\s)]+/g, "[server-path]");
}
