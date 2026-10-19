import { createHash } from "node:crypto";
import { strict as assert } from "node:assert";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { after, before, beforeEach, describe, it } from "node:test";

type AccountModule = typeof import("../src/account");

/** Faux service de comptes : l'API de la webapp, telle que l'app desktop l'appelle. */
interface Call {
  path: string;
  body: Record<string, unknown>;
}

let api: Server;
let calls: Call[] = [];
let respond: (call: Call) => { status: number; body: unknown } = () => ({ status: 500, body: {} });
let account: AccountModule;

const ADA = { subject: "kc-ada", email: "ada@example.com", givenName: "Ada", familyName: "Lovelace" };

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk: Buffer) => (raw += chunk.toString("utf8")));
    req.on("end", () => resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : {}));
  });
}

before(async () => {
  api = createServer(async (req, res) => {
    const call = { path: req.url ?? "", body: await readBody(req) };
    calls.push(call);
    const { status, body } = respond(call);
    res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(body));
  });
  await new Promise<void>((resolve) => api.listen(0, "127.0.0.1", resolve));
  const port = (api.address() as { port: number }).port;
  process.env.TF_DESKTOP_API_URL = `http://127.0.0.1:${port}/`;
  process.env.TF_DESKTOP_WEB_URL = "https://app.example.test";
  account = await import("../src/account");
});

after(() => api.close());

beforeEach(() => {
  calls = [];
  respond = () => ({ status: 500, body: {} });
});

describe("pkce", () => {
  it("derives the S256 challenge from a fresh verifier", () => {
    const first = account.pkce();
    const second = account.pkce();

    assert.match(first.verifier, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(first.challenge, createHash("sha256").update(first.verifier).digest("base64url"));
    assert.notEqual(first.verifier, second.verifier);
  });
});

describe("addresses", () => {
  it("reads the web app and its API from the environment, without a trailing slash", () => {
    assert.equal(account.WEB_URL, "https://app.example.test");
    assert.match(account.API_URL, /^http:\/\/127\.0\.0\.1:\d+$/);
    assert.equal(account.ACCOUNT_SERVER, account.API_URL);
    assert.equal(account.accountPageUrl(), "https://app.example.test/account");
  });
});

describe("readAccount", () => {
  it("reads the account, tied to the account service that returned it", () => {
    assert.deepEqual(account.readAccount(ADA, "https://api.example.test"), { issuer: "https://api.example.test", ...ADA });
  });

  const refused: [string, unknown][] = [
    ["no address", { ...ADA, email: "" }],
    ["no subject", { ...ADA, subject: undefined }],
    ["nothing", null],
  ];
  for (const [name, value] of refused) {
    it(`refuses an account with ${name}`, () => {
      assert.throws(() => account.readAccount(value), /no address/);
    });
  }

  it("keeps an account without a name", () => {
    assert.equal(account.readAccount({ subject: "kc-1", email: "x@example.com" }).givenName, "");
  });
});

describe("deviceName", () => {
  const cases: [string, NodeJS.Platform, string][] = [
    ["PIERRE-PC", "win32", "PIERRE-PC (Windows)"],
    ["ada-laptop", "linux", "ada-laptop (Linux)"],
    ["Ada's MacBook", "darwin", "Adas MacBook (macOS)"],
    ["", "win32", "Windows"],
  ];
  for (const [host, platform, expected] of cases) {
    it(`names ${JSON.stringify(host)} on ${platform}`, () => assert.equal(account.deviceName(host, platform), expected));
  }
});

describe("signIn", () => {
  /** Faux navigateur : vérifie la page de la webapp, puis rejoue le retour vers l'app. */
  function browser(answer: (page: URL) => string) {
    const pages: URL[] = [];
    const open = async (url: string) => {
      const page = new URL(url);
      pages.push(page);
      const back = new URL(answer(page));
      setImmediate(() => void fetch(back).catch(() => undefined));
    };
    return { open, pages };
  }

  it("opens the web app's sign-in page, then exchanges the code with its PKCE verifier", async () => {
    let challenge = "";
    respond = (call) => {
      const verifier = String(call.body.codeVerifier);
      const ok = createHash("sha256").update(verifier).digest("base64url") === challenge && call.body.code === "the-code";
      return ok
        ? { status: 200, body: { data: { token: "tfa_session", expiresAt: "2027-01-17T20:00:00", account: ADA } } }
        : { status: 400, body: { message: "The sign-in expired or is invalid: start again from the app" } };
    };
    const { open, pages } = browser((page) => {
      challenge = page.searchParams.get("code_challenge") ?? "";
      return `${page.searchParams.get("redirect_uri")}?code=the-code&state=${page.searchParams.get("state")}`;
    });

    const result = await account.signIn(open);

    assert.equal(pages[0]?.origin + pages[0]?.pathname, "https://app.example.test/auth/desktop");
    assert.equal(pages[0]?.searchParams.get("code_challenge_method"), "S256");
    assert.equal(pages[0]?.searchParams.get("signup"), null);
    assert.match(pages[0]?.searchParams.get("redirect_uri") ?? "", /^http:\/\/127\.0\.0\.1:4781[2-5]\/callback$/);
    assert.equal(result.sessionToken, "tfa_session");
    assert.deepEqual(result.account, { issuer: account.ACCOUNT_SERVER, ...ADA });
    assert.equal(calls[0]?.path, "/api/auth/desktop/token");
    assert.equal(calls[0]?.body.redirectUri, pages[0]?.searchParams.get("redirect_uri"));
    assert.equal(typeof calls[0]?.body.deviceName, "string");
  });

  it("asks the web app for its sign-up page when creating an account", async () => {
    respond = () => ({ status: 200, body: { data: { token: "tfa_new", account: ADA } } });
    const { open, pages } = browser((page) => `${page.searchParams.get("redirect_uri")}?code=c&state=${page.searchParams.get("state")}`);

    await account.signIn(open, true);

    assert.equal(pages[0]?.searchParams.get("signup"), "1");
  });

  it("refuses a return that doesn't carry the app's state", async () => {
    const { open } = browser((page) => `${page.searchParams.get("redirect_uri")}?code=c&state=forged`);

    await assert.rejects(account.signIn(open), /didn't finish/);
    assert.equal(calls.length, 0);
  });

  it("says when the person cancelled", async () => {
    const { open } = browser((page) => `${page.searchParams.get("redirect_uri")}?error=access_denied&state=${page.searchParams.get("state")}`);

    await assert.rejects(account.signIn(open), /cancelled/);
  });

  it("fails when the account service doesn't open a session", async () => {
    respond = () => ({ status: 400, body: { message: "The sign-in expired or is invalid: start again from the app" } });
    const { open } = browser((page) => `${page.searchParams.get("redirect_uri")}?code=c&state=${page.searchParams.get("state")}`);

    await assert.rejects(account.signIn(open), /expired or is invalid/);
  });

  it("stops when the browser can't be opened", async () => {
    await assert.rejects(account.signIn(() => Promise.reject(new Error("no browser"))), /no browser/);
  });
});

describe("session", () => {
  it("reads the account again at launch", async () => {
    respond = () => ({ status: 200, body: { data: { token: null, account: { ...ADA, givenName: "Augusta" } } } });

    const fresh = await account.refresh("tfa_session");

    assert.equal(fresh.givenName, "Augusta");
    assert.deepEqual(calls[0], { path: "/api/auth/desktop/session", body: { token: "tfa_session" } });
  });

  it("tells when the session ended online", async () => {
    respond = () => ({ status: 401, body: { message: "The session ended: sign in again" } });

    await assert.rejects(account.refresh("tfa_session"), account.SessionEndedError);
  });

  it("closes the session on sign-out", async () => {
    respond = () => ({ status: 200, body: { data: null } });

    await account.revoke("tfa_session");

    assert.deepEqual(calls[0], { path: "/api/auth/desktop/revoke", body: { token: "tfa_session" } });
  });

  it("reports an unavailable account service", async () => {
    respond = () => ({ status: 503, body: {} });

    await assert.rejects(account.refresh("tfa_session"), /answered 503/);
  });
});

describe("signInError", () => {
  const cases: [string, RegExp][] = [
    ["Sign-in was cancelled", /cancelled/],
    ["fetch failed", /couldn't reach/],
    ["The TaskForce account service answered 502", /couldn't reach/],
    ["The sign-in expired or is invalid: start again from the app", /took too long/],
    ["something else", /didn't finish/],
  ];
  for (const [message, expected] of cases) {
    it(`explains ${JSON.stringify(message)}`, () => assert.match(account.signInError(message), expected));
  }
});
