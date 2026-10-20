import { strict as assert } from "node:assert";
import { join } from "node:path";
import { describe, it } from "node:test";

import { storeDataDir } from "../src/paths";

const LOCAL = "C:\\Users\\alex\\AppData\\Local";

describe("storeDataDir", () => {
  it("puts the data of the Store version in the LocalState of its package", () => {
    const exe = "C:\\Program Files\\WindowsApps\\TaskForceProject.TaskForceProject_1.2.2.0_x64__9bkwj5xgjqyyy\\app\\TaskForce.exe";

    assert.equal(
      storeDataDir(exe, LOCAL),
      join(LOCAL, "Packages", "TaskForceProject.TaskForceProject_9bkwj5xgjqyyy", "LocalState"),
    );
  });

  it("reads a package with a resource id", () => {
    const exe = "D:\\WindowsApps\\TaskForceProject.TaskForceProject_1.2.2.0_x64_fr-fr_9bkwj5xgjqyyy\\app\\TaskForce.exe";

    assert.equal(
      storeDataDir(exe, LOCAL),
      join(LOCAL, "Packages", "TaskForceProject.TaskForceProject_9bkwj5xgjqyyy", "LocalState"),
    );
  });

  it("leaves the app installed from the website where it is", () => {
    assert.equal(storeDataDir("C:\\Users\\alex\\AppData\\Local\\Programs\\TaskForce\\TaskForce.exe", LOCAL), null);
  });

  it("gives up without the local app data folder", () => {
    const exe = "C:\\Program Files\\WindowsApps\\TaskForceProject.TaskForceProject_1.2.2.0_x64__9bkwj5xgjqyyy\\app\\TaskForce.exe";

    assert.equal(storeDataDir(exe, undefined), null);
  });
});
