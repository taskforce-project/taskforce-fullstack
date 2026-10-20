import { strict as assert } from "node:assert";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";

import { AVATAR_FILE, AVATAR_TAKEN_MARKER, MAX_AVATAR_BYTES, avatarSource, downloadAccountAvatar } from "../src/avatar";

describe("avatarSource", () => {
  const API = "https://api.example.test";
  const cases: [string, string | null | undefined, string | null][] = [
    ["a photo sent to the account, read from the API", "/api/files/avatars/7", "https://api.example.test/api/files/avatars/7"],
    ["a photo from the sign-in provider, as is", "https://avatars.githubusercontent.com/u/1?v=4", "https://avatars.githubusercontent.com/u/1?v=4"],
    ["no photo", null, null],
    ["an account kept by an older version", undefined, null],
    ["a photo over plain HTTP", "http://cdn.example.test/me.png", null],
    ["another scheme", "file:///etc/passwd", null],
  ];
  for (const [name, avatarUrl, expected] of cases) {
    it(name, () => assert.equal(avatarSource(avatarUrl, API)?.toString() ?? null, expected));
  }

  it("allows plain HTTP to the API on this computer, in development", () => {
    assert.equal(avatarSource("/api/files/avatars/7", "http://localhost:8080")?.toString(), "http://localhost:8080/api/files/avatars/7");
  });
});

describe("downloadAccountAvatar", () => {
  const PHOTO = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
  let server: Server;
  let apiUrl = "";
  let requests = 0;
  let reply: { status: number; type: string; body: Buffer } = { status: 200, type: "image/png", body: PHOTO };
  let dataDir = "";

  before(async () => {
    server = createServer((_req, res) => {
      requests++;
      res.writeHead(reply.status, { "Content-Type": reply.type }).end(reply.body);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    apiUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });

  after(() => server.close());

  beforeEach(() => {
    requests = 0;
    reply = { status: 200, type: "image/png", body: PHOTO };
    // Dossier du compte pas encore créé : premier lancement sur ce poste.
    dataDir = join(mkdtempSync(join(tmpdir(), "tf-avatar-")), "account");
  });

  afterEach(() => rmSync(join(dataDir, ".."), { recursive: true, force: true }));

  it("drops the photo in the account folder for the backend", async () => {
    const file = await downloadAccountAvatar("/api/files/avatars/7", dataDir, { apiUrl });

    assert.equal(file, join(dataDir, AVATAR_FILE));
    assert.deepEqual(readFileSync(join(dataDir, AVATAR_FILE)), PHOTO);
  });

  it("asks nothing once this computer has taken the photo", async () => {
    await downloadAccountAvatar("/api/files/avatars/7", dataDir, { apiUrl });
    writeFileSync(join(dataDir, AVATAR_TAKEN_MARKER), "photo reprise");
    requests = 0;

    assert.equal(await downloadAccountAvatar("/api/files/avatars/7", dataDir, { apiUrl }), null);
    assert.equal(requests, 0);
  });

  const refused: [string, typeof reply][] = [
    ["a missing photo", { status: 404, type: "application/json", body: Buffer.from("{}") }],
    ["something that isn't an image", { status: 200, type: "text/html", body: Buffer.from("<html>") }],
    ["an empty image", { status: 200, type: "image/jpeg", body: Buffer.alloc(0) }],
  ];
  for (const [name, answer] of refused) {
    it(`leaves ${name} out`, async () => {
      reply = answer;

      assert.equal(await downloadAccountAvatar("/api/files/avatars/7", dataDir, { apiUrl }), null);
      assert.equal(existsSync(join(dataDir, AVATAR_FILE)), false);
    });
  }

  const tooLarge: [string, () => Response][] = [
    ["announced", () => new Response(PHOTO, { headers: { "content-type": "image/jpeg", "content-length": String(MAX_AVATAR_BYTES + 1) } })],
    ["received", () => new Response(Buffer.alloc(MAX_AVATAR_BYTES + 1), { headers: { "content-type": "image/jpeg" } })],
  ];
  for (const [name, response] of tooLarge) {
    it(`leaves a photo ${name} too large out`, async () => {
      const fetchImpl = (() => Promise.resolve(response())) as typeof fetch;

      assert.equal(await downloadAccountAvatar("/api/files/avatars/7", dataDir, { apiUrl, fetchImpl }), null);
      assert.equal(existsSync(join(dataDir, AVATAR_FILE)), false);
    });
  }

  it("starts the app anyway when the account service can't be reached", async () => {
    const offline = (() => Promise.reject(new TypeError("fetch failed"))) as typeof fetch;

    assert.equal(await downloadAccountAvatar("/api/files/avatars/7", dataDir, { apiUrl, fetchImpl: offline }), null);
  });
});
