import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { postmasterReady } from "../src/postgres";

/** postmaster.pid tel que PostgreSQL l'écrit : numéro, dossier, début, port, socket, adresse, mémoire, état. */
const pidFile = (pid: number, status: string) =>
  [String(pid), "C:/data/postgres", "1761390000", "55329", "", "127.0.0.1", "  1234   5678", `${status.padEnd(8)}`, ""].join("\r\n");

describe("postmasterReady", () => {
  it("is ready once the server it started writes the ready status", () => {
    assert.equal(postmasterReady(pidFile(4242, "ready"), 4242), true);
  });

  it("waits while the server is still starting", () => {
    assert.equal(postmasterReady(pidFile(4242, "starting"), 4242), false);
  });

  it("ignores a lock file left by another server", () => {
    assert.equal(postmasterReady(pidFile(1111, "ready"), 4242), false);
  });

  it("waits for a lock file that is not complete yet", () => {
    assert.equal(postmasterReady("4242\r\nC:/data/postgres\r\n", 4242), false);
    assert.equal(postmasterReady("", 4242), false);
  });

  it("is never ready without a process", () => {
    assert.equal(postmasterReady(pidFile(4242, "ready"), undefined), false);
  });
});
