import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

// No database in unit tests: any accidental query fails loudly instead of hanging.
vi.mock("./db.js", () => ({
  prisma: new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === "then") return undefined;
        return new Proxy({}, { get: () => () => Promise.reject(new Error(`unexpected prisma call: ${String(prop)}`)) });
      },
    },
  ),
}));

let app: FastifyInstance;

// Importing the whole app (every route and engine) took 7–10+ s on a loaded dev box, past the 10 s default.
beforeAll(async () => {
  const { buildApp } = await import("./server.js");
  app = await buildApp({ logger: false });
  await app.ready();
}, 30_000);

afterAll(async () => {
  await app.close();
});

describe("GET /v1/health", () => {
  it("reports ok with version and uptime", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/health" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.version).toBe("string");
    expect(typeof body.uptimeSeconds).toBe("number");
    expect(body.engines).toBeUndefined();
  });
});

describe("GET /v1/formats", () => {
  it("serves the registry", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/formats" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.formats)).toBe(true);
    expect(body.pairs.length).toBeGreaterThan(200);
  });
});

describe("error envelope", () => {
  it("maps zod failures to 400 VALIDATION", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/signup",
      payload: { email: "not-an-email", password: "short" },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe("VALIDATION");
    expect(typeof body.error.message).toBe("string");
    const paths = (body.error.details as Array<{ path: string }>).map((d) => d.path);
    expect(paths).toContain("email");
    expect(paths).toContain("password");
  });

  it("returns 404 NOT_FOUND for unknown endpoints", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/nope" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("NOT_FOUND");
  });

  it("returns 401 UNAUTHORIZED without a session", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/billing/checkout", payload: { plan: "pro" } });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("UNAUTHORIZED");
    // a guest cookie is minted even on failure
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("rejects an upload without a multipart body", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/conversions", payload: { target: "mp3" } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION");
  });
});

describe("cross-site request guard", () => {
  it("refuses state changes from another site's pages", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/signup",
      headers: { origin: "https://evil.example" },
      payload: { email: "not-an-email", password: "short" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("FORBIDDEN");
  });

  it("lets our own origin and non-browser clients through to validation", async () => {
    for (const headers of [{ origin: "http://localhost:3000" }, {}]) {
      const res = await app.inject({ method: "POST", url: "/v1/auth/signup", headers, payload: { email: "x", password: "y" } });
      expect(res.statusCode).toBe(400);
    }
  });

  it("does not apply to reads or to signed provider webhooks", async () => {
    expect((await app.inject({ method: "GET", url: "/v1/health", headers: { origin: "https://evil.example" } })).statusCode).toBe(200);
    const hook = await app.inject({ method: "POST", url: "/v1/billing/webhook", headers: { origin: "https://evil.example", "content-type": "application/json" }, payload: "{}" });
    expect(hook.statusCode).not.toBe(403);
  });
});

describe("client IP trust", () => {
  it("believes X-Forwarded-For only from local/private proxies", async () => {
    const { buildApp } = await import("./server.js");
    const probe = await buildApp({ logger: false });
    probe.get("/__ip", async (req) => ({ ip: req.ip }));
    await probe.ready();
    const ip = async (remoteAddress: string) =>
      (await probe.inject({ method: "GET", url: "/__ip", remoteAddress, headers: { "x-forwarded-for": "1.2.3.4" } })).json().ip;
    expect(await ip("203.0.113.9")).toBe("203.0.113.9"); // public peer: header ignored
    expect(await ip("127.0.0.1")).toBe("1.2.3.4"); // Next.js rewrite on loopback
    expect(await ip("172.18.0.5")).toBe("1.2.3.4"); // Caddy/web on a Docker network
    await probe.close();
  }, 30_000);
});
