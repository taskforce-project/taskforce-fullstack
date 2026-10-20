import { strict as assert } from "node:assert";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { after, before, beforeEach, describe, it } from "node:test";

import { SessionEndedError } from "../src/account";
import { readMove, Transfer } from "../src/transfer";

/** Faux serveur : la webapp (`/api/auth/desktop/transfer/...`) et l'API locale (`/api/workspaces/...`). */
interface Call {
  method: string;
  path: string;
  headers: IncomingMessage["headers"];
  body: Buffer;
}

const ZIP = Buffer.from("PK\u0003\u0004project", "latin1");
const TOKEN = "tfa_session";

let server: Server;
let base = "";
let calls: Call[] = [];
let respond: (call: Call) => { status: number; type?: string; body: unknown } = () => ({ status: 500, body: {} });

before(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const call = { method: req.method ?? "", path: req.url ?? "", headers: req.headers, body: Buffer.concat(chunks) };
      calls.push(call);
      const { status, type, body } = respond(call);
      res.writeHead(status, { "Content-Type": type ?? "application/json" });
      res.end(Buffer.isBuffer(body) ? body : JSON.stringify(body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

after(() => server.close());

beforeEach(() => {
  calls = [];
  respond = () => ({ status: 500, body: {} });
});

const transfer = () => new Transfer(base, "https://app.example.test");
const local = () => ({ origin: base, launchToken: "tfd_launch" });

describe("readMove", () => {
  it("reads a move asked by the page", () => {
    assert.deepEqual(readMove({ workspace: "acme", projectId: 5, target: "ada-space" }),
      { workspace: "acme", projectId: 5, target: "ada-space" });
  });

  const refused: [string, unknown][] = [
    ["no workspace", { projectId: 5, target: "ada" }],
    ["a workspace with a slash", { workspace: "acme/../x", projectId: 5, target: "ada" }],
    ["a project that isn't a number", { workspace: "acme", projectId: "5", target: "ada" }],
    ["a negative project", { workspace: "acme", projectId: -1, target: "ada" }],
    ["no target", { workspace: "acme", projectId: 5 }],
    ["nothing", null],
  ];
  for (const [name, input] of refused) {
    it(`refuses ${name}`, () => assert.equal(readMove(input), null));
  }
});

describe("webProjects", () => {
  it("lists the web projects with the app's session, and leaves malformed entries out", async () => {
    respond = () => ({
      status: 200,
      body: { data: { workspaces: [
        { slug: "acme", name: "Acme", projects: [{ id: 5, name: "Apollo", identifier: "APO", issueCount: 12 }, { name: "no id" }] },
        { name: "no slug" },
      ] } },
    });

    const workspaces = await transfer().webProjects(TOKEN);

    assert.deepEqual(workspaces, [{ slug: "acme", name: "Acme", projects: [{ id: 5, name: "Apollo", identifier: "APO", issueCount: 12 }] }]);
    assert.equal(calls[0]?.path, "/api/auth/desktop/transfer/projects");
    assert.deepEqual(JSON.parse(calls[0]?.body.toString() ?? "{}"), { token: TOKEN });
  });

  it("says when the session ended", async () => {
    respond = () => ({ status: 401, body: { message: "The session ended: sign in again" } });

    await assert.rejects(transfer().webProjects(TOKEN), SessionEndedError);
  });
});

describe("bring", () => {
  it("downloads the project from the web app and creates it on this computer", async () => {
    respond = (call) => call.path === "/api/auth/desktop/transfer/bundle"
      ? { status: 200, type: "application/zip", body: ZIP }
      : { status: 201, body: { data: { id: 9, name: "Apollo" } } };

    const moved = await transfer().bring(TOKEN, { workspace: "acme", projectId: 5 }, "ada", local());

    assert.deepEqual(moved, { id: 9, name: "Apollo", workspace: "ada" });
    assert.deepEqual(JSON.parse(calls[0]?.body.toString() ?? "{}"), { token: TOKEN, workspace: "acme", projectId: 5 });
    const created = calls[1];
    assert.equal(created?.path, "/api/workspaces/ada/projects/import");
    assert.equal(created?.headers.authorization, "Bearer tfd_launch");
    assert.equal(created?.headers["content-type"], "application/zip");
    assert.deepEqual(created?.body, ZIP);
  });

  it("passes on what the local API says when it refuses the file", async () => {
    respond = (call) => call.path.startsWith("/api/auth/")
      ? { status: 200, type: "application/zip", body: ZIP }
      : { status: 400, body: { message: "This file isn't a TaskForce project file." } };

    await assert.rejects(transfer().bring(TOKEN, { workspace: "acme", projectId: 5 }, "ada", local()),
      /isn't a TaskForce project file/);
  });
});

describe("send", () => {
  it("packs the project on this computer and creates it in the web app", async () => {
    respond = (call) => call.method === "GET"
      ? { status: 200, type: "application/zip", body: ZIP }
      : { status: 201, body: { data: { id: 42, name: "Apollo" } } };

    const moved = await transfer().send(TOKEN, { workspace: "ada", projectId: 9 }, "acme", local());

    assert.deepEqual(moved, { id: 42, name: "Apollo", workspace: "acme", url: "https://app.example.test/acme/projects/42" });
    assert.equal(calls[0]?.path, "/api/workspaces/ada/projects/9/bundle");
    assert.equal(calls[0]?.headers.authorization, "Bearer tfd_launch");
    const created = calls[1];
    assert.equal(created?.path, "/api/auth/desktop/transfer/import?workspace=acme");
    assert.equal(created?.headers["x-taskforce-session"], TOKEN);
    assert.deepEqual(created?.body, ZIP);
  });

  it("refuses a project too large to move, before sending anything", async () => {
    const huge = new Transfer(base, "https://app.example.test", (async () =>
      new Response(ZIP, { headers: { "content-length": String(1024 * 1024 * 1024) } })) as typeof fetch);

    await assert.rejects(huge.send(TOKEN, { workspace: "ada", projectId: 9 }, "acme", local()), /too large/);
  });
});

describe("messages and addresses", () => {
  it("says plainly when the web app can't be reached", () => {
    assert.match(Transfer.errorMessage("fetch failed"), /couldn't reach the web app/);
    assert.equal(Transfer.errorMessage("This file isn't a TaskForce project file."), "This file isn't a TaskForce project file.");
  });

  it("only opens addresses of the web app", () => {
    assert.equal(transfer().isWebAddress("https://app.example.test/acme/projects/42"), true);
    assert.equal(transfer().isWebAddress("https://evil.example/acme"), false);
    assert.equal(transfer().isWebAddress(42), false);
  });
});
