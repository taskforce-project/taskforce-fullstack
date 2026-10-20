import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { BACKUPS, backupBeforeMigration, KEEP, prune, VERSION_FILE } from "../src/backup";

let dataDir = "";
let dumps: string[] = [];

/** Base embarquée : chaque copie écrit un fichier, comme pg_dump. */
const database = {
  dump: async (file: string) => {
    dumps.push(file);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, "PGDMP");
  },
};

const NOW = new Date("2026-10-20T14:05:09.123Z");

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "tf-backup-"));
  dumps = [];
});

afterEach(() => rmSync(dataDir, { recursive: true, force: true }));

describe("backupBeforeMigration", () => {
  it("copies the database when another version of the app opened it last", async () => {
    writeFileSync(join(dataDir, VERSION_FILE), "1.0.3");

    const file = await backupBeforeMigration(database, dataDir, "1.0.4", false, NOW);

    assert.equal(file, join(dataDir, BACKUPS, "2026-10-20T14-05-09-before-1.0.4.dump"));
    assert.deepEqual(dumps, [file]);
    assert.equal(readFileSync(join(dataDir, VERSION_FILE), "utf8"), "1.0.4");
  });

  it("copies a database opened by a version that didn't note itself", async () => {
    assert.ok(await backupBeforeMigration(database, dataDir, "1.0.4", false, NOW));
    assert.equal(dumps.length, 1);
  });

  it("copies nothing when the same version opens the database again", async () => {
    writeFileSync(join(dataDir, VERSION_FILE), "1.0.4\n");

    assert.equal(await backupBeforeMigration(database, dataDir, "1.0.4", false, NOW), null);
    assert.equal(dumps.length, 0);
  });

  it("copies nothing for a brand new database, and notes the version", async () => {
    assert.equal(await backupBeforeMigration(database, dataDir, "1.0.4", true, NOW), null);
    assert.equal(dumps.length, 0);
    assert.equal(readFileSync(join(dataDir, VERSION_FILE), "utf8"), "1.0.4");
  });

  it("lets the app start when the copy fails, and tries again at the next launch", async () => {
    writeFileSync(join(dataDir, VERSION_FILE), "1.0.3");
    const failing = { dump: async (file: string) => {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, "half");
      throw new Error("disk full");
    } };

    assert.equal(await backupBeforeMigration(failing, dataDir, "1.0.4", false, NOW), null);
    assert.equal(readFileSync(join(dataDir, VERSION_FILE), "utf8"), "1.0.3");
    assert.deepEqual(readdirSync(join(dataDir, BACKUPS)), []);
  });

  it(`keeps the ${KEEP} most recent copies`, async () => {
    for (const [index, version] of ["1.0.1", "1.0.2", "1.0.3", "1.0.4", "1.0.5"].entries()) {
      await backupBeforeMigration(database, dataDir, version, false, new Date(NOW.getTime() + index * 60_000));
    }

    assert.deepEqual(readdirSync(join(dataDir, BACKUPS)).map((name) => name.split("-before-")[1]),
      ["1.0.3.dump", "1.0.4.dump", "1.0.5.dump"]);
  });
});

describe("prune", () => {
  it("only removes copies, oldest first", () => {
    const dir = join(dataDir, BACKUPS);
    mkdirSync(dir);
    for (const name of ["2026-01-01-before-1.dump", "2026-02-01-before-2.dump", "notes.txt"]) writeFileSync(join(dir, name), "x");

    assert.deepEqual(prune(dir, 1), ["2026-01-01-before-1.dump"]);
    assert.deepEqual(readdirSync(dir).sort(), ["2026-02-01-before-2.dump", "notes.txt"]);
  });

  it("does nothing without a backups folder", () => {
    assert.deepEqual(prune(join(dataDir, "missing")), []);
    assert.equal(existsSync(join(dataDir, "missing")), false);
  });
});
