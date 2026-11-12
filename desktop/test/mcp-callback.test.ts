import { strict as assert } from "node:assert";
import { createServer, get, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, it } from "node:test";

import { connectorEnvironment } from "../src/backend";
import { MCP_CALLBACK_PATH, MCP_CALLBACK_PORTS, McpCallback, outcomeOf, page, type CallbackOutcome } from "../src/mcp-callback";
import { freePort } from "../src/net";

/** Un faux backend local : il répond au retour comme le vrai (302 vers l'app), et garde ce qu'il a reçu. */
function fakeBackend(location: string): Promise<{ server: Server; port: number; seen: { path?: string; host?: string } }> {
  const seen: { path?: string; host?: string } = {};
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      seen.path = req.url;
      seen.host = req.headers.host;
      res.writeHead(302, { Location: location }).end();
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, port: (server.address() as AddressInfo).port, seen }));
  });
}

function fetchPage(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    get(url, (res: IncomingMessage) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
    }).on("error", reject);
  });
}

describe("outcomeOf", () => {
  const cases: [string | undefined, CallbackOutcome][] = [
    ["http://127.0.0.1:47900/acme/settings?section=integrations&mcp=connected&connector=linear", "connected"],
    ["http://127.0.0.1:47900/acme/settings?mcp=admin&connector=slack-mcp", "admin"],
    ["http://127.0.0.1:47900/acme/settings?mcp=error", "error"],
    ["http://127.0.0.1:47900/?mcp=error", "error"],
    ["/?mcp=whatever", "error"],
    [undefined, "error"],
  ];
  for (const [location, outcome] of cases) {
    it(`reads ${outcome} from ${location ?? "no location"}`, () => assert.equal(outcomeOf(location), outcome));
  }
});

describe("page", () => {
  it("says what happened, light and dark, with nothing personal in it", () => {
    assert.match(page("connected"), /You're connected/);
    assert.match(page("admin"), /admin needs to approve TaskForce/);
    assert.match(page("error"), /didn't finish/);
    assert.match(page("connected"), /prefers-color-scheme:dark/);
  });
});

describe("McpCallback", () => {
  it("uses fixed loopback ports, distinct from the account sign-in", () => {
    assert.deepEqual(MCP_CALLBACK_PORTS, [47816, 47817, 47818, 47819]);
    assert.equal(MCP_CALLBACK_PATH, "/mcp/callback");
  });

  it("hands the code to the local backend, shows the end page and brings TaskForce back", async () => {
    const backend = await fakeBackend("http://127.0.0.1:47900/acme/settings?section=integrations&mcp=connected&connector=linear");
    const done: CallbackOutcome[] = [];
    const port = await freePort();
    const callback = new McpCallback((outcome) => done.push(outcome), [port]);
    try {
      const redirectUri = await callback.start();
      assert.equal(redirectUri, `http://127.0.0.1:${port}/mcp/callback`);
      callback.connect(backend.port);

      const res = await fetchPage(`${redirectUri}?code=c-1&state=s-1&iss=https%3A%2F%2Fas.example`);

      assert.equal(res.status, 200);
      assert.match(res.body, /You're connected/);
      assert.equal(backend.seen.path, "/api/mcp/oauth/callback?code=c-1&state=s-1&iss=https%3A%2F%2Fas.example");
      assert.equal(backend.seen.host, `127.0.0.1:${backend.port}`);
      assert.deepEqual(done, ["connected"]);
    } finally {
      await callback.stop();
      backend.server.close();
    }
  });

  it("says the connection didn't finish while the backend is not ready, and answers 404 elsewhere", async () => {
    const port = await freePort();
    const callback = new McpCallback(() => undefined, [port]);
    try {
      await callback.start();
      const early = await fetchPage(`http://127.0.0.1:${port}/mcp/callback?code=x&state=y`);
      assert.equal(early.status, 503);
      assert.match(early.body, /didn't finish/);
      const other = await fetchPage(`http://127.0.0.1:${port}/elsewhere`);
      assert.equal(other.status, 404);
    } finally {
      await callback.stop();
    }
  });

  it("takes the next port when the first is busy, and fails when all are", async () => {
    const busy = await freePort();
    const holder = createServer();
    await new Promise<void>((resolve) => holder.listen(busy, "127.0.0.1", () => resolve()));
    const next = await freePort();
    const callback = new McpCallback(() => undefined, [busy, next]);
    try {
      assert.equal(await callback.start(), `http://127.0.0.1:${next}/mcp/callback`);
      const none = new McpCallback(() => undefined, [busy]);
      await assert.rejects(none.start(), /ports are all in use/);
    } finally {
      await callback.stop();
      holder.close();
    }
  });
});

describe("connectorEnvironment", () => {
  it("gives the backend the fixed return address and the hosted API of the desktop client document", () => {
    const env = connectorEnvironment("http://127.0.0.1:47816/mcp/callback", "https://api.example.test", {});
    assert.deepEqual(env, {
      TF_DESKTOP_MCP_REDIRECT_URI: "http://127.0.0.1:47816/mcp/callback",
      TF_DESKTOP_HOSTED_API_URL: "https://api.example.test",
    });
  });

  it("passes the person's own pre-registered clients, nothing else", () => {
    const env = connectorEnvironment("http://127.0.0.1:47816/mcp/callback", "https://api.example.test", {
      TF_CATALOG_SHOW_UNTRIED: "true",
      TF_MCP_ASANA_CLIENT_ID: "id-1",
      TF_MCP_ASANA_CLIENT_SECRET: "secret-1",
      TF_MCP_ASANA_OTHER: "no",
      AWS_SECRET_ACCESS_KEY: "no",
    });
    assert.equal(env.TF_CATALOG_SHOW_UNTRIED, undefined);
    assert.equal(env.TF_MCP_ASANA_CLIENT_ID, "id-1");
    assert.equal(env.TF_MCP_ASANA_CLIENT_SECRET, "secret-1");
    assert.equal(env.TF_MCP_ASANA_OTHER, undefined);
    assert.equal(env.AWS_SECRET_ACCESS_KEY, undefined);
  });
});
