import { strict as assert } from "node:assert";
import { afterEach, beforeEach, describe, it } from "node:test";

import { GitHubRelay } from "../src/github-relay";

const TOKEN = "gho_" + "a".repeat(36);

let reads = 0;
let answer: string | null = TOKEN;
let relay: GitHubRelay;

beforeEach(async () => {
  reads = 0;
  answer = TOKEN;
  relay = new GitHubRelay(async () => {
    reads++;
    return answer;
  });
  await relay.start();
});

afterEach(() => relay.stop());

const get = (path: string, token: string | null = relay.token) =>
  fetch(`${relay.url()}${path}`, token ? { headers: { Authorization: `Bearer ${token}` } } : {});

describe("GitHubRelay", () => {
  it("gives the person's GitHub token to the backend only", async () => {
    const response = await get("/token");

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { token: TOKEN });
    assert.match(relay.url(), /^http:\/\/127\.0\.0\.1:\d+$/);
  });

  const refused: [string, string | null][] = [
    ["without a service token", null],
    ["with another token", "tfgh_wrong"],
  ];
  for (const [name, token] of refused) {
    it(`answers 401 ${name}`, async () => {
      assert.equal((await get("/token", token)).status, 401);
      assert.equal(reads, 0);
    });
  }

  it("says when nobody is signed in to GitHub", async () => {
    answer = null;

    const response = await get("/token");

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { detail: "Not signed in to GitHub" });
  });

  it("keeps a token for a minute, and reads again after a sign-in", async () => {
    await get("/token");
    await get("/token");
    assert.equal(reads, 1);

    relay.invalidate();
    await get("/token");
    assert.equal(reads, 2);
  });

  it("never keeps an absence of token: a sign-in counts at once", async () => {
    answer = null;
    await get("/token");
    answer = TOKEN;

    assert.equal((await get("/token")).status, 200);
    assert.equal(reads, 2);
  });

  it("answers 404 elsewhere", async () => {
    assert.equal((await get("/other")).status, 404);
  });
});
