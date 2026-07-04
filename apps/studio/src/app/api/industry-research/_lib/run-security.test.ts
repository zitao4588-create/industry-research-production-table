import { describe, expect, it } from "vitest";
import {
  issueRunStreamToken,
  RunSecurityError,
  readJsonBodyWithLimit,
  sanitizeRunError,
  validateRunStreamPostRequest,
  validateRunStreamTokenRequest,
} from "./run-security";

const PROD_ORIGIN = "https://research.playgamelab.cn";

// 模块级 token / 限流 Map 是共享状态（单进程假设，见 DECISIONS），
// 每条用例使用独立 IP，避免互相污染限流桶。
let ipCounter = 0;

function nextIp() {
  ipCounter += 1;
  return `10.0.0.${ipCounter}`;
}

function createRequest({
  host = "research.playgamelab.cn",
  origin = PROD_ORIGIN,
  token,
  ip = nextIp(),
  method = "POST",
}: {
  host?: string | null;
  origin?: string | null;
  token?: string;
  ip?: string;
  method?: string;
} = {}) {
  const headers = new Headers();

  if (host) headers.set("host", host);
  if (origin) headers.set("origin", origin);
  if (token) headers.set("x-industry-research-run-token", token);
  headers.set("x-forwarded-for", ip);

  return new Request("https://research.playgamelab.cn/api/run/stream", {
    method,
    headers,
  });
}

const prodEnv = { NODE_ENV: "production" };

describe("run stream token", () => {
  it("accepts a freshly issued token exactly once", () => {
    const { token } = issueRunStreamToken();

    expect(() =>
      validateRunStreamPostRequest(createRequest({ token }), prodEnv),
    ).not.toThrow();
    expect(() =>
      validateRunStreamPostRequest(createRequest({ token }), prodEnv),
    ).toThrow(RunSecurityError);
  });

  it("rejects a missing token with 403", () => {
    try {
      validateRunStreamPostRequest(createRequest({}), prodEnv);
      expect.unreachable("missing token must throw");
    } catch (error) {
      expect(error).toBeInstanceOf(RunSecurityError);
      expect((error as RunSecurityError).status).toBe(403);
    }
  });

  it("rejects an unknown token", () => {
    expect(() =>
      validateRunStreamPostRequest(
        createRequest({ token: "forged-token" }),
        prodEnv,
      ),
    ).toThrow("run token 无效或已过期");
  });
});

describe("host and origin allowlist", () => {
  it("rejects a host outside the allowlist", () => {
    const { token } = issueRunStreamToken();

    expect(() =>
      validateRunStreamPostRequest(
        createRequest({ token, host: "evil.example.com" }),
        prodEnv,
      ),
    ).toThrow("Host 不在允许列表");
  });

  it("rejects an origin outside the allowlist", () => {
    const { token } = issueRunStreamToken();

    expect(() =>
      validateRunStreamPostRequest(
        createRequest({ token, origin: "https://evil.example.com" }),
        prodEnv,
      ),
    ).toThrow("Origin 不在允许列表");
  });

  it("rejects a production POST without an Origin header", () => {
    const { token } = issueRunStreamToken();

    expect(() =>
      validateRunStreamPostRequest(
        createRequest({ token, origin: null }),
        prodEnv,
      ),
    ).toThrow("必须携带 Origin");
  });

  it("accepts extra origins from env config", () => {
    const { token } = issueRunStreamToken();
    const env = {
      NODE_ENV: "production",
      AGENT_FACTORY_ALLOWED_ORIGINS: "https://staging.example.com",
    };

    expect(() =>
      validateRunStreamPostRequest(
        createRequest({
          token,
          host: "staging.example.com",
          origin: "https://staging.example.com",
        }),
        env,
      ),
    ).not.toThrow();
  });

  it("allows localhost only outside production", () => {
    expect(() =>
      validateRunStreamTokenRequest(
        createRequest({
          host: "localhost:3000",
          origin: "http://localhost:3000",
          method: "GET",
        }),
        { NODE_ENV: "development" },
      ),
    ).not.toThrow();

    expect(() =>
      validateRunStreamTokenRequest(
        createRequest({
          host: "localhost:3000",
          origin: "http://localhost:3000",
          method: "GET",
        }),
        prodEnv,
      ),
    ).toThrow(RunSecurityError);
  });
});

describe("rate limit", () => {
  it("rejects requests beyond the per-ip hourly limit with 429", () => {
    const env = {
      NODE_ENV: "production",
      AGENT_FACTORY_MAX_RUNS_PER_IP_PER_HOUR: "2",
    };
    const ip = nextIp();

    for (let index = 0; index < 2; index += 1) {
      const { token } = issueRunStreamToken();
      expect(() =>
        validateRunStreamPostRequest(createRequest({ token, ip }), env),
      ).not.toThrow();
    }

    const { token } = issueRunStreamToken();

    try {
      validateRunStreamPostRequest(createRequest({ token, ip }), env);
      expect.unreachable("rate limit must throw");
    } catch (error) {
      expect(error).toBeInstanceOf(RunSecurityError);
      expect((error as RunSecurityError).status).toBe(429);
    }
  });
});

describe("readJsonBodyWithLimit", () => {
  function bodyRequest(body: string, contentLength?: string) {
    const headers = new Headers({ "content-type": "application/json" });

    if (contentLength) {
      headers.set("content-length", contentLength);
    }

    return new Request("https://research.playgamelab.cn/api/run/stream", {
      method: "POST",
      headers,
      body,
    });
  }

  it("parses a body under the limit", async () => {
    const parsed = await readJsonBodyWithLimit(bodyRequest('{"ok":true}'), {});

    expect(parsed).toEqual({ ok: true });
  });

  it("rejects when the declared content-length exceeds the cap", async () => {
    const env = { AGENT_FACTORY_RUN_MAX_BODY_BYTES: "16" };

    await expect(
      readJsonBodyWithLimit(bodyRequest('{"ok":true}', "999999"), env),
    ).rejects.toThrow("请求体超过大小上限");
  });

  it("rejects when the actual body exceeds the cap even if the header lies", async () => {
    const env = { AGENT_FACTORY_RUN_MAX_BODY_BYTES: "8" };

    await expect(
      readJsonBodyWithLimit(bodyRequest('{"padding":"0123456789"}', "4"), env),
    ).rejects.toThrow("请求体超过大小上限");
  });

  it("rejects invalid json with 400", async () => {
    try {
      await readJsonBodyWithLimit(bodyRequest("not-json"), {});
      expect.unreachable("invalid json must throw");
    } catch (error) {
      expect(error).toBeInstanceOf(RunSecurityError);
      expect((error as RunSecurityError).status).toBe(400);
    }
  });
});

describe("sanitizeRunError", () => {
  it("redacts bearer tokens, keys, and local paths", () => {
    const sanitized = sanitizeRunError(
      new Error(
        "Bearer sk-abc123 failed; api key: sk-secret, SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi at /Users/qzt/secret/file and /opt/playgamelab/industry-research/env",
      ),
    );

    expect(sanitized).not.toContain("sk-abc123");
    expect(sanitized).not.toContain("sk-secret");
    expect(sanitized).not.toContain("eyJhbGciOi");
    expect(sanitized).not.toContain("/Users/qzt");
    expect(sanitized).not.toContain("/opt/playgamelab");
    expect(sanitized).toContain("[redacted]");
    expect(sanitized).toContain("[local-path]");
    expect(sanitized).toContain("[server-path]");
  });
});
