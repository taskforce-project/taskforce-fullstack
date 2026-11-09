import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";

import { ApiError } from "../src/api.js";
import { startHeartbeat, type Heartbeat } from "../src/heartbeat.js";
import { run } from "../src/proc.js";

/** Laisse passer un tour de boucle : la promesse rejetée du faux signe de vie. */
const settled = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

describe("startHeartbeat : le signe de vie, et l'arrêt qu'il apporte (R138)", () => {
  let beat: Heartbeat | null = null;

  beforeEach(() => mock.timers.enable({ apis: ["setInterval"] }));
  afterEach(() => {
    beat?.stop();
    mock.timers.reset();
  });

  it("signale la vie de la mission à chaque intervalle", () => {
    const calls: number[] = [];
    beat = startHeartbeat({ heartbeat: async (id) => { calls.push(id); } }, 8, 5_000);

    mock.timers.tick(15_000);

    assert.deepEqual(calls, [8, 8, 8]);
    assert.equal(beat.closed.aborted, false);
  });

  it("un refus du serveur (403) lève l'arrêt : la mission est close dans TaskForce", async () => {
    beat = startHeartbeat({ heartbeat: async () => { throw new ApiError(403, "Invalid delegation session"); } }, 8, 5_000);

    mock.timers.tick(5_000);
    await settled();

    assert.equal(beat.closed.aborted, true);
  });

  for (const [label, error] of [
    ["un jeton expiré (401)", new ApiError(401, "Unauthorized")],
    ["une panne du serveur (500)", new ApiError(500, "Oops")],
    ["le réseau", new Error("fetch failed")],
  ] as const) {
    it(`${label} n'arrête pas la mission`, async () => {
      beat = startHeartbeat({ heartbeat: async () => { throw error; } }, 8, 5_000);

      mock.timers.tick(5_000);
      await settled();

      assert.equal(beat.closed.aborted, false);
    });
  }

  it("un vrai processus s'arrête quand le signe de vie est refusé", async () => {
    mock.timers.reset();
    beat = startHeartbeat({ heartbeat: async () => { throw new ApiError(403, "Invalid delegation session"); } }, 10);

    const result = await run(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { timeoutMs: 30_000, signal: beat.closed });

    assert.equal(result.aborted, true);
    assert.equal(beat.closed.aborted, true);
  });

  it("ne signale plus rien une fois arrêté", () => {
    const calls: number[] = [];
    beat = startHeartbeat({ heartbeat: async (id) => { calls.push(id); } }, 8, 5_000);

    beat.stop();
    mock.timers.tick(15_000);

    assert.deepEqual(calls, []);
  });
});
