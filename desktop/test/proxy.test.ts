import { strict as assert } from "node:assert";
import { createServer, type Server } from "node:http";
import { connect, type AddressInfo } from "node:net";
import type { Duplex } from "node:stream";
import { describe, it } from "node:test";

import { freePort } from "../src/net";
import { Proxy, routeTo } from "../src/proxy";

describe("routeTo", () => {
  const cases: [string | undefined, "backend" | "frontend"][] = [
    ["/api/projects", "backend"],
    ["/api", "backend"],
    ["/api/files/objects/a.png?expires=1&signature=x", "backend"],
    ["/ws", "backend"],
    ["/ws-sockjs/info?t=1", "backend"],
    ["/readyz", "backend"],
    ["/livez", "backend"],
    ["/", "frontend"],
    [undefined, "frontend"],
    ["/acme/dashboard", "frontend"],
    // Un workspace dont le nom commence comme une route du backend reste à l'interface.
    ["/wsteam/dashboard", "frontend"],
    ["/apix/board", "frontend"],
    ["/_next/static/chunks/main.js", "frontend"],
  ];
  for (const [url, target] of cases) {
    it(`sends ${url ?? "an empty path"} to the ${target}`, () => {
      assert.equal(routeTo(url), target);
    });
  }
});

describe("Proxy", () => {
  const serve = (body: string): Promise<{ server: Server; port: number }> =>
    new Promise((resolve) => {
      const server = createServer((_req, res) => res.end(body));
      server.listen(0, "127.0.0.1", () => resolve({ server, port: (server.address() as AddressInfo).port }));
    });

  it("keeps the preferred port when it is free, so the window origin stays the same", async () => {
    const preferred = await freePort();
    const proxy = new Proxy();
    try {
      assert.equal(await proxy.reserve(preferred), `http://127.0.0.1:${preferred}`);
    } finally {
      await proxy.stop();
    }
  });

  it("takes another port when the preferred one is busy", async () => {
    const busy = await serve("other app");
    const proxy = new Proxy();
    try {
      await proxy.reserve(busy.port);
      assert.notEqual(proxy.port, busy.port);
      assert.ok(proxy.port > 0);
    } finally {
      await proxy.stop();
      busy.server.close();
    }
  });

  it("says TaskForce is starting until the services are ready, then relays to them", async () => {
    const backend = await serve("api");
    const frontend = await serve("interface");
    const proxy = new Proxy();
    try {
      const origin = await proxy.reserve();
      const early = await fetch(`${origin}/api/projects`);
      assert.equal(early.status, 503);
      await early.text();

      await proxy.start(backend.port, frontend.port);
      assert.equal(await (await fetch(`${origin}/api/projects`)).text(), "api");
      assert.equal(await (await fetch(`${origin}/acme/dashboard`)).text(), "interface");
    } finally {
      await proxy.stop();
      backend.server.close();
      frontend.server.close();
    }
  });
});

describe("Proxy stop", () => {
  it("stops even while the window keeps a realtime connection open", async () => {
    // Service qui accepte la mise à niveau WebSocket et garde la connexion, comme le temps réel du backend.
    const backend = createServer();
    const held: Duplex[] = [];
    backend.on("upgrade", (_req, socket) => {
      held.push(socket);
      socket.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n");
    });
    await new Promise<void>((resolve) => backend.listen(0, "127.0.0.1", () => resolve()));
    const backendPort = (backend.address() as AddressInfo).port;
    const proxy = new Proxy();
    try {
      await proxy.reserve();
      await proxy.start(backendPort, backendPort);
      const client = connect(proxy.port, "127.0.0.1");
      await new Promise<void>((resolve) => {
        client.write("GET /ws HTTP/1.1\r\nHost: 127.0.0.1\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n");
        client.once("data", () => resolve());
      });

      const started = Date.now();
      await proxy.stop();
      assert.ok(Date.now() - started < 3_000, "the open connection does not hold the stop");
      client.destroy();
    } finally {
      for (const socket of held) socket.destroy();
      backend.close();
    }
  });
});
