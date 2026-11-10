import { describe, expect, it } from "vitest";

import { appVersion } from "./app-version";

describe("appVersion", () => {
  it.each([
    ["the product version, the commit on hover", "1.7.0", "9cdea55b", { label: "v1.7.0", title: "commit 9cdea55b" }],
    ["the commit when no product version is set", undefined, "dev", { label: "dev", title: "commit dev" }],
    ["a default outside a deployment", undefined, undefined, { label: "v1.0", title: undefined }],
  ])("shows %s", (_label, semver, commit, expected) => {
    expect(appVersion(semver, commit)).toEqual(expected);
  });
});
