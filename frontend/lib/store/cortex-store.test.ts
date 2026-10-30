import { beforeEach, describe, expect, it } from "vitest";

import { useCortexStore } from "./cortex-store";

describe("useCortexStore", () => {
  beforeEach(() => useCortexStore.setState({ draft: "", pending: null }));

  it("sends what the bar says, then empties the bar", () => {
    useCortexStore.getState().setDraft("  Which issues are blocked?  ");

    expect(useCortexStore.getState().submit()).toBe(true);
    expect(useCortexStore.getState().draft).toBe("");
    expect(useCortexStore.getState().pending?.text).toBe("Which issues are blocked?");
  });

  it("sends nothing from an empty bar", () => {
    useCortexStore.getState().setDraft("   ");

    expect(useCortexStore.getState().submit()).toBe(false);
    expect(useCortexStore.getState().pending).toBeNull();
  });

  it("gives a request to the conversation once", () => {
    useCortexStore.getState().setDraft("Create a project Pricing");
    useCortexStore.getState().submit();
    const id = useCortexStore.getState().pending?.id ?? -1;

    expect(useCortexStore.getState().take(id)).toBe("Create a project Pricing");
    expect(useCortexStore.getState().take(id)).toBeNull();
  });

  it("does not give an older request", () => {
    useCortexStore.getState().setDraft("first");
    useCortexStore.getState().submit();
    const first = useCortexStore.getState().pending?.id ?? -1;
    useCortexStore.getState().setDraft("second");
    useCortexStore.getState().submit();

    expect(useCortexStore.getState().take(first)).toBeNull();
    expect(useCortexStore.getState().pending?.text).toBe("second");
  });
});
