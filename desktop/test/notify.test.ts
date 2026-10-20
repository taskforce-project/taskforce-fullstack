import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { readNotice } from "../src/notify";

describe("readNotice", () => {
  it("keeps a notification and the page to open", () => {
    assert.deepEqual(readNotice({ title: " Assigned to you ", body: "APO-12 Fix the login", path: "/acme/projects/5/issues/12" }),
      { title: "Assigned to you", body: "APO-12 Fix the login", path: "/acme/projects/5/issues/12" });
  });

  it("bounds what the page sends", () => {
    const notice = readNotice({ title: "t".repeat(500), body: "b".repeat(5000) });
    assert.equal(notice?.title.length, 120);
    assert.equal(notice?.body.length, 300);
    assert.equal(notice?.path, null);
  });

  const outside: [string, unknown][] = [
    ["an address", "https://evil.example/acme"],
    ["a protocol-relative address", "//evil.example/acme"],
    ["a path with a backslash", "/\\evil.example"],
    ["a path with spaces", "/acme projects"],
    ["something else", 42],
  ];
  for (const [name, path] of outside) {
    it(`opens no page for ${name}`, () => assert.equal(readNotice({ title: "Hi", path })?.path, null));
  }

  const refused: [string, unknown][] = [
    ["no title", { body: "x" }],
    ["a blank title", { title: "  " }],
    ["nothing", null],
  ];
  for (const [name, input] of refused) {
    it(`shows nothing for ${name}`, () => assert.equal(readNotice(input), null));
  }
});
