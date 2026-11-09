import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { SCREEN_FILE } from "../src/update-pending";

/**
 * Ce que l'écran de la mise à jour de l'installeur partage avec l'app : NSIS ne s'exécute pas ici, mais le contrat entre
 * les deux côtés se lit dans leurs sources. Le déroulé réel se vérifie sur une version empaquetée.
 */
const installer = readFileSync(join(__dirname, "..", "installer.nsh"), "utf8");
const lines = installer.split(/\r?\n/);
const code = lines.filter((line) => !line.trim().startsWith(";")).join("\n");
const splash = readFileSync(join(__dirname, "..", "static", "splash.html"), "utf8");
const main = readFileSync(join(__dirname, "..", "src", "main.ts"), "utf8");

describe("the installer's update screen and the app", () => {
  it("hands over through the file the app watches", () => {
    assert.match(code, new RegExp(`\\$APPDATA\\\\\\$\\{PRODUCT_FILENAME\\}\\\\${SCREEN_FILE}"`));
  });

  it("says the same sentences as the app's own update screen", () => {
    assert.match(code, /"Installing TaskForce \$\{VERSION\}"/);
    const note = /note: "([^"]+)"/.exec(main)?.[1] ?? "";
    assert.match(main, /step: `Installing TaskForce \$\{version\}`/);
    assert.ok(note.length > 0 && code.includes(`"${note}"`), `the installer does not say: ${note}`);
  });

  it("has the size and the colors of the app's update screen", () => {
    const define = (name: string) => new RegExp(`!define ${name} (\\w+)`).exec(code)?.[1];
    assert.equal(define("TF_WIDTH"), "420");
    assert.equal(define("TF_HEIGHT"), "280");
    const colorref = (name: string) => define(name)?.replace("0x00", "").toLowerCase();
    const css = (name: string, scheme: string) => new RegExp(`--${name}: #([0-9a-f]{6})`).exec(scheme)?.[1];
    const [light, dark] = splash.split("prefers-color-scheme: dark");
    const swap = (hex?: string) => hex?.replace(/(..)(..)(..)/, "$3$2$1");
    assert.equal(colorref("TF_BG_LIGHT"), swap(css("bg", light ?? "")));
    assert.equal(colorref("TF_INK_LIGHT"), swap(css("ink", light ?? "")));
    assert.equal(colorref("TF_MUTED_LIGHT"), swap(css("muted", light ?? "")));
    assert.equal(colorref("TF_LINE_LIGHT"), swap(css("line", light ?? "")));
    assert.equal(colorref("TF_ACCENT"), swap(css("accent", light ?? "")));
    assert.equal(colorref("TF_BG_DARK"), swap(css("bg", dark ?? "")));
    assert.equal(colorref("TF_INK_DARK"), swap(css("ink", dark ?? "")));
    assert.equal(colorref("TF_MUTED_DARK"), swap(css("muted", dark ?? "")));
    assert.equal(colorref("TF_LINE_DARK"), swap(css("line", dark ?? "")));
  });

  it("starts no script host and no hidden shell: the app is unsigned and an antivirus has flagged it", () => {
    assert.doesNotMatch(code, /mshta|powershell|wscript|cscript|cmd\.exe|rundll32/i);
    assert.doesNotMatch(code, /\.(ps1|vbs|hta|bat|cmd)\b/i);
  });

  it("stands up only for an update the person is waiting for, and never in the uninstaller", () => {
    assert.match(code, /\$\{ifNot\} \$\{isUpdated\}\s+\$\{orIfNot\} \$\{isForceRun\}\s+Return/);
    assert.match(code, /!ifndef BUILD_UNINSTALLER\s+!define TF_WORKER_FLAG/);
  });
});
