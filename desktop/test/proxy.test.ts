import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { routeTo } from "../src/proxy";

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
