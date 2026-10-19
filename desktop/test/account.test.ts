import { createHash } from "node:crypto";
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { pkce, readIdToken, signInError } from "../src/account";

const ISSUER = "https://auth.example.test/realms/taskforce";
const CLIENT_ID = "taskforce-desktop";

/** Jeton d'identité non signé : `readIdToken` ne vérifie que ce que l'app attend (cf. son commentaire). */
function idToken(claims: Record<string, unknown>): string {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "RS256" })}.${part(claims)}.signature`;
}

const valid = {
  iss: ISSUER,
  aud: CLIENT_ID,
  nonce: "n-1",
  exp: Math.floor(Date.now() / 1000) + 300,
  sub: "c3a8b0b4-1111-4c6e-9b1a-000000000001",
  email: "ada@example.com",
  given_name: "Ada",
  family_name: "Lovelace",
};

describe("pkce", () => {
  it("derives the S256 challenge from a fresh verifier", () => {
    const first = pkce();
    const second = pkce();

    assert.match(first.verifier, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(first.challenge, createHash("sha256").update(first.verifier).digest("base64url"));
    assert.notEqual(first.verifier, second.verifier);
  });
});

describe("readIdToken", () => {
  const expected = { issuer: ISSUER, clientId: CLIENT_ID, nonce: "n-1" };

  it("reads the account, tied to the issuer that signed it in", () => {
    assert.deepEqual(readIdToken(idToken(valid), expected), {
      issuer: ISSUER,
      subject: valid.sub,
      email: "ada@example.com",
      givenName: "Ada",
      familyName: "Lovelace",
    });
  });

  it("accepts an audience list that names the app", () => {
    assert.equal(readIdToken(idToken({ ...valid, aud: ["account", CLIENT_ID] }), expected).email, "ada@example.com");
  });

  const refused: [string, Record<string, unknown>, RegExp][] = [
    ["another issuer", { iss: "https://evil.example.test/realms/taskforce" }, /another issuer/],
    ["another application", { aud: "taskforce-web" }, /another application/],
    ["a replayed nonce", { nonce: "n-0" }, /replayed/],
    ["an expired token", { exp: Math.floor(Date.now() / 1000) - 3600 }, /expired/],
    ["an account without address", { email: undefined }, /no address/],
  ];
  for (const [name, change, message] of refused) {
    it(`refuses ${name}`, () => {
      assert.throws(() => readIdToken(idToken({ ...valid, ...change }), expected), message);
    });
  }

  it("refuses a malformed token", () => {
    assert.throws(() => readIdToken("not-a-token", expected), /Malformed/);
  });

  it("skips the nonce on a refresh, where there is none", () => {
    const { nonce: _nonce, ...withoutNonce } = valid;
    assert.equal(readIdToken(idToken(withoutNonce), { issuer: ISSUER, clientId: CLIENT_ID }).subject, valid.sub);
  });
});

describe("signInError", () => {
  const cases: [string, RegExp][] = [
    ["Sign-in was cancelled", /cancelled/],
    ["fetch failed", /couldn't reach your account/],
    ["The TaskForce account service answered 503", /couldn't reach your account/],
    ["Offline tokens not allowed for the user or client", /can't stay signed in/],
    ["invalid_grant", /didn't finish/],
  ];
  for (const [message, expected] of cases) {
    it(`says "${message}" in plain words`, () => {
      assert.match(signInError(message), expected);
    });
  }
});
