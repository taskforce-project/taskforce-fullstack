import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  ghError,
  isNewRepoName,
  isRepoFullName,
  parseCreatedRepo,
  parseDeviceCode,
  parseRepoLines,
} from "../src/github";

describe("isRepoFullName", () => {
  const cases: [unknown, boolean][] = [
    ["acme/website", true],
    ["Miche1-Pierre/runner-sandbox", true],
    ["acme/my.site_v2", true],
    ["acme", false],
    ["acme/../secrets", false],
    ["-acme/site", false],
    ["acme/site/extra", false],
    ["acme/site name", false],
    [42, false],
    [null, false],
  ];
  for (const [value, expected] of cases) {
    it(`${JSON.stringify(value)} -> ${expected}`, () => assert.equal(isRepoFullName(value), expected));
  }
});

describe("isNewRepoName", () => {
  const cases: [unknown, boolean][] = [
    ["website", true],
    ["my.site_v2-beta", true],
    ["acme/website", true],
    [".", false],
    ["..", false],
    ["my site", false],
    ["", false],
    [undefined, false],
  ];
  for (const [value, expected] of cases) {
    it(`${JSON.stringify(value)} -> ${expected}`, () => assert.equal(isNewRepoName(value), expected));
  }
});

describe("parseRepoLines", () => {
  it("reads the name, the visibility and the push right of each repository", () => {
    const output = "acme/website\ttrue\ttrue\r\nada/notes\tfalse\tfalse\n\n";
    assert.deepEqual(parseRepoLines(output), [
      { fullName: "acme/website", private: true, canPush: true },
      { fullName: "ada/notes", private: false, canPush: false },
    ]);
  });

  it("skips a line that is not a repository", () => {
    assert.deepEqual(parseRepoLines("gh: Not Found (HTTP 404)\n"), []);
  });
});

describe("parseCreatedRepo", () => {
  const cases: [string, string | null][] = [
    ["https://github.com/ada/site\n", "ada/site"],
    ["https://github.com/acme/site.git\n", "acme/site"],
    ["✓ Created repository ada/site on GitHub\n  https://github.com/ada/site\n", "ada/site"],
    ["", null],
    ["https://example.com/ada/site", null],
  ];
  for (const [output, fullName] of cases) {
    it(`reads ${JSON.stringify(output.trim())}`, () => assert.equal(parseCreatedRepo(output), fullName));
  }
});

describe("parseDeviceCode", () => {
  it("reads the one-time code that gh prints", () => {
    const output = "\n! First copy your one-time code: 1A2B-3C4D\nOpen this URL to continue in your web browser: https://github.com/login/device\n";
    assert.equal(parseDeviceCode(output), "1A2B-3C4D");
  });

  it("waits for the code when it is not printed yet", () => {
    assert.equal(parseDeviceCode("! First copy your one-ti"), null);
  });
});

describe("ghError", () => {
  const cases: [string, string][] = [
    ["GraphQL: Name already exists on this account (createRepository)\n", "Name already exists on this account"],
    ["HTTP 404: Not Found (https://api.github.com/repos/a/b)\n", "Not Found (https://api.github.com/repos/a/b)"],
    ["\n\nsomething went wrong\nmore", "something went wrong"],
    ["", "fallback"],
  ];
  for (const [stderr, message] of cases) {
    it(`reads ${JSON.stringify(stderr.trim().split("\n")[0])}`, () => assert.equal(ghError(stderr, "fallback"), message));
  }
});
