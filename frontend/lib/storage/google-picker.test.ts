import { beforeEach, describe, expect, it } from "vitest"

import { loadPicker, pickFromGoogleDrive, PICKER_SCRIPT, resetPickerForTests, type GooglePickerApi } from "./google-picker"

const CONFIG = { developerKey: "key", appId: "123", accessToken: "token" }

/** Un faux sélecteur : il garde ce que TaskForce lui demande, et répond ce qu'on lui dit. */
function fakePicker(answer: { action: string; docs?: { id: string; name?: string; url?: string; mimeType?: string }[] }) {
  const calls: string[] = []
  class DocsView {
    constructor(readonly viewId?: string) { calls.push(`view:${viewId}`) }
    setIncludeFolders() { return this }
    setSelectFolderEnabled(on: boolean) { calls.push(`folders:${on}`); return this }
    setMimeTypes(types: string) { calls.push(`types:${types}`); return this }
  }
  class PickerBuilder {
    private callback: ((r: typeof answer) => void) | null = null
    addView() { return this }
    enableFeature(f: string) { calls.push(`feature:${f}`); return this }
    setOAuthToken(t: string) { calls.push(`token:${t}`); return this }
    setDeveloperKey(k: string) { calls.push(`key:${k}`); return this }
    setAppId(a: string) { calls.push(`app:${a}`); return this }
    setTitle() { return this }
    setCallback(cb: (r: typeof answer) => void) { this.callback = cb; return this }
    build() {
      return { setVisible: () => { this.callback?.({ action: "loaded" }); this.callback?.(answer) } }
    }
  }
  const api = {
    DocsView, PickerBuilder,
    ViewId: { DOCS: "all", FOLDERS: "folders" },
    Feature: { SUPPORT_DRIVES: "drives", MULTISELECT_ENABLED: "multi" },
    Action: { PICKED: "picked", CANCEL: "cancel" },
  } as unknown as GooglePickerApi
  return { api, calls }
}

describe("google-picker", () => {
  beforeEach(() => {
    resetPickerForTests()
    document.head.innerHTML = ""
  })

  it("picks a folder with the person's token, the browser key and the project", async () => {
    const { api, calls } = fakePicker({ action: "picked", docs: [{ id: "f1", name: "Reports", url: "https://drive/f1" }] })
    const win = Object.assign(Object.create(window) as Window, { google: { picker: api }, document })

    const picked = await pickFromGoogleDrive(CONFIG, "folder", "Choose a folder", win)

    expect(picked).toEqual([{ id: "f1", name: "Reports", url: "https://drive/f1", mimeType: null }])
    expect(calls).toEqual(expect.arrayContaining(["view:folders", "folders:true", "types:application/vnd.google-apps.folder",
      "feature:drives", "token:token", "key:key", "app:123"]))
    expect(calls).not.toContain("feature:multi")
  })

  it("picks several files, and null when the person closes it", async () => {
    const many = fakePicker({ action: "picked", docs: [{ id: "a" }, { id: "b", name: "B" }] })
    const win = Object.assign(Object.create(window) as Window, { google: { picker: many.api }, document })
    expect(await pickFromGoogleDrive(CONFIG, "files", "Choose files", win)).toEqual([
      { id: "a", name: "a", url: null, mimeType: null }, { id: "b", name: "B", url: null, mimeType: null }])
    expect(many.calls).toContain("feature:multi")

    const closed = fakePicker({ action: "cancel" })
    const win2 = Object.assign(Object.create(window) as Window, { google: { picker: closed.api }, document })
    expect(await pickFromGoogleDrive(CONFIG, "files", "Choose files", win2)).toBeNull()
  })

  /** Un faux document : il garde les scripts ajoutés, sans les charger. */
  function fakeDocument() {
    const scripts: { src: string; async: boolean; onload: (() => void) | null; onerror: (() => void) | null }[] = []
    const doc = {
      createElement: () => {
        const script = { src: "", async: false, onload: null, onerror: null }
        return script
      },
      head: { appendChild: (s: (typeof scripts)[number]) => { scripts.push(s); return s } },
    }
    return { doc: doc as unknown as Document, scripts }
  }

  it("loads Google's script once, then the picker module", async () => {
    const { api } = fakePicker({ action: "cancel" })
    const { doc, scripts } = fakeDocument()
    const win = { document: doc } as unknown as Window & {
      gapi?: { load: (n: string, o: { callback: () => void }) => void }; google?: { picker?: GooglePickerApi }
    }
    const promise = loadPicker(win)
    expect(scripts).toHaveLength(1)
    expect(scripts[0].src).toBe(PICKER_SCRIPT)
    win.gapi = { load: (name, options) => { expect(name).toBe("picker"); win.google = { picker: api }; options.callback() } }
    scripts[0].onload?.()

    await expect(promise).resolves.toBe(api)
  })

  it("a script that doesn't load fails, and the next try loads again", async () => {
    const { doc, scripts } = fakeDocument()
    const win = { document: doc } as unknown as Window
    const promise = loadPicker(win)
    scripts[0].onerror?.()
    await expect(promise).rejects.toThrow("picker")

    void loadPicker(win).catch(() => undefined)
    expect(scripts).toHaveLength(2)
  })
})
