import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { installerArgs } from "../src/installer-launch";
import { INSTALLING_NOTE, NOT_UPDATED_NOTE, parseScreenRect, SCREEN_SIZE, SCREENS, UPDATED_NOTE } from "../src/screen";
import { SCREEN_FILE } from "../src/update-pending";

/**
 * Ce que l'écran de la mise à jour de l'installeur partage avec l'app : NSIS ne s'exécute pas ici, mais le contrat entre
 * les deux côtés se lit dans leurs sources. Le déroulé réel se vérifie sur une version empaquetée.
 */
const desktop = join(__dirname, "..");
const installer = readFileSync(join(desktop, "installer.nsh"), "utf8");
const code = installer.split(/\r?\n/).filter((line) => !line.trim().startsWith(";")).join("\n");
const css = readFileSync(join(desktop, "static", "shell.css"), "utf8");
const define = (name: string) => new RegExp(`!define ${name} (\\w+)`).exec(code)?.[1];

describe("the installer's update screen and the app", () => {
  it("hands over through the file the app watches", () => {
    assert.match(code, new RegExp(`\\$APPDATA\\\\\\$\\{PRODUCT_FILENAME\\}\\\\${SCREEN_FILE}"`));
  });

  it("writes in it where its window is, as the app reads it", () => {
    const written = /FileWrite \$0 "(\$tfX \$tfY \$tfW \$tfH)"/.exec(code)?.[1];
    assert.ok(written, "the installer does not write its place");
    assert.deepEqual(parseScreenRect(written.replace("$tfX", "-1250").replace("$tfY", "96").replace("$tfW", "1250").replace("$tfH", "800")), {
      x: -1250,
      y: 96,
      width: 1250,
      height: 800,
    });
  });

  it("takes the place of the app's screen the app names", () => {
    assert.ok(installerArgs("42").includes("--screen=42"));
    assert.match(code, /\$\{GetOptions\} \$R9 "--screen=" \$0/);
  });

  it("says the same sentences as the app's own screens, one line of text per line", () => {
    const say = (step: string, note: string) => {
      const [first, second = ""] = note.split("\n");
      return `!insertmacro tfSay "${step}" "${first}" "${second}"`;
    };
    const installing = SCREENS.installing("${VERSION}");
    const [first, second] = INSTALLING_NOTE.split("\n");
    assert.ok(code.includes(`StrCpy $tfStep "${installing.step}"`));
    assert.ok(code.includes(`StrCpy $tfNote "${first}"`) && code.includes(`StrCpy $tfNote2 "${second}"`));
    assert.ok(code.includes(say(SCREENS.updated.step, UPDATED_NOTE)), "the installer does not open as the app does");
    assert.ok(code.includes(say(SCREENS.notUpdated("${VERSION}").step, NOT_UPDATED_NOTE)), "the installer does not fail as the app does");
  });

  it("draws every line of its sentences on one line of the column", () => {
    const sentences = [...code.matchAll(/!insertmacro tfSay "([^"]*)" "([^"]*)" "([^"]*)"/g)].flatMap((match) => match.slice(1));
    assert.ok(sentences.length >= 9);
    for (const sentence of sentences) assert.ok(sentence.length <= 48, `too long for one line: ${sentence}`);
  });

  it("has the size of the app's screen and the measures of its right side", () => {
    assert.equal(Number(define("TF_WIDTH")), SCREEN_SIZE.width);
    assert.equal(Number(define("TF_HEIGHT")), SCREEN_SIZE.height);
    const measures: [string, string][] = [
      ["TF_PANEL", "panel"],
      ["TF_COLUMN", "column"],
      ["TF_TOP", "top"],
      ["TF_LOGO", "logo"],
      ["TF_STEP_GAP", "step-gap"],
      ["TF_STEP", "step"],
      ["TF_STEP_LINE", "step-line"],
      ["TF_BAR_GAP", "bar-gap"],
      ["TF_BAR", "bar"],
      ["TF_NOTE", "note"],
      ["TF_NOTE_LINE", "note-line"],
    ];
    for (const [name, property] of measures) {
      assert.equal(define(name), new RegExp(`--${property}: (\\d+)px`).exec(css)?.[1], `${name} is not --${property}`);
    }
  });

  it("has the colors of the app's screen, light and dark", () => {
    const [light = "", dark = ""] = css.split("prefers-color-scheme: dark");
    const token = (name: string, scheme: string) => new RegExp(`--${name}: #([0-9a-f]{6})`).exec(scheme)?.[1];
    const colorref = (name: string) => define(name)?.replace("0x00", "").toLowerCase();
    const bgr = (hex?: string) => hex?.replace(/(..)(..)(..)/, "$3$2$1");
    for (const [name, scheme] of [["LIGHT", light], ["DARK", dark]] as const) {
      for (const color of ["bg", "ink", "muted", "line"]) {
        assert.equal(colorref(`TF_${color.toUpperCase()}_${name}`), bgr(token(color, scheme)), `${color} (${name.toLowerCase()})`);
      }
    }
    assert.equal(colorref("TF_ACCENT"), bgr(token("accent", light)));
  });

  it("stills its bar as the page does without motion: the accent at half over the track", () => {
    const [light = "", dark = ""] = css.split("prefers-color-scheme: dark");
    const rgb = (hex = "") => [0, 2, 4].map((at) => parseInt(hex.slice(at, at + 2), 16));
    const accent = rgb(/--accent: #([0-9a-f]{6})/.exec(light)?.[1]);
    for (const [name, scheme] of [["LIGHT", light], ["DARK", dark]] as const) {
      const track = rgb(/--line: #([0-9a-f]{6})/.exec(scheme)?.[1]);
      const still = rgb(define(`TF_STILL_${name}`)?.replace("0x00", "").replace(/(..)(..)(..)/, "$3$2$1"));
      still.forEach((channel, index) => assert.ok(Math.abs(channel - ((accent[index] ?? 0) + (track[index] ?? 0)) / 2) <= 1));
    }
  });

  it("starts no script host and no hidden shell: the app is unsigned and an antivirus has flagged it", () => {
    assert.doesNotMatch(code, /mshta|powershell|wscript|cscript|cmd\.exe|rundll32/i);
    assert.doesNotMatch(code, /\.(ps1|vbs|hta|bat|cmd)\b/i);
  });

  it("leaves as soon as the new version has shown its window, without waiting for the worker to tidy up", () => {
    assert.match(code, /\$\{andIfNot\} \$\{FileExists\} "\$tfMark"\s+Call tfCloseScreen/);
  });

  it("keeps the template's system dialog out of a failed update: it would block the install behind the window", () => {
    assert.match(code, /!macro customUnInstallCheck[\s\S]*?\$\{ifNot\} \$\{isUpdated\}\s+MessageBox/);
  });

  it("stands up only for an update the person is waiting for, and never in the uninstaller", () => {
    assert.match(code, /\$\{ifNot\} \$\{isUpdated\}\s+\$\{orIfNot\} \$\{isForceRun\}\s+Return/);
    assert.match(code, /!ifndef BUILD_UNINSTALLER\s+!define TF_WORKER_FLAG/);
  });
});

/** La largeur et la hauteur d'un JPEG, lues dans son en-tête de trame (SOF0 à SOF2). */
function jpegSize(file: string): { width: number; height: number } {
  const bytes = readFileSync(file);
  for (let at = 2; at < bytes.length - 9;) {
    if (bytes[at] !== 0xff) throw new Error(`${file}: not a JPEG marker at ${at}`);
    const marker = bytes[at + 1] ?? 0;
    if (marker >= 0xc0 && marker <= 0xc2) return { height: bytes.readUInt16BE(at + 5), width: bytes.readUInt16BE(at + 7) };
    at += 2 + bytes.readUInt16BE(at + 2);
  }
  throw new Error(`${file}: no frame header`);
}

describe("the left panel the installer draws, an image of the pages' own", () => {
  const panel = JSON.parse(readFileSync(join(desktop, "installer", "panel.json"), "utf8")) as { sources: string; scales: number[] };

  it("is up to date with the panel of the pages: otherwise, npm run screen-panel", async () => {
    const { sourcesHash } = (await import("../scripts/screen-panel-sources.mjs")) as { sourcesHash: (dir: string) => string };
    assert.equal(panel.sources, sourcesHash(desktop), "the panel changed: run `npm run screen-panel` and commit the images");
  });

  it("exists at each scale the installer serves, at the panel's size in pixels", async () => {
    const { SCALES } = (await import("../scripts/screen-panel-sources.mjs")) as { SCALES: number[] };
    assert.deepEqual(panel.scales, SCALES);
    for (const scale of SCALES) {
      const file = join(desktop, "installer", `panel-${scale}.jpg`);
      assert.ok(existsSync(file), `no panel at ${scale}%`);
      assert.deepEqual(jpegSize(file), { width: Math.round((520 * scale) / 100), height: Math.round((640 * scale) / 100) });
      assert.ok(code.includes(`"\${PROJECT_DIR}\\installer\\panel-${scale}.jpg"`), `the installer does not carry the panel at ${scale}%`);
    }
  });

  it("weighs little in the installer: the five images together stay under a megabyte", () => {
    const total = panel.scales.reduce((sum, scale) => sum + readFileSync(join(desktop, "installer", `panel-${scale}.jpg`)).length, 0);
    assert.ok(total < 1024 * 1024, `${total} bytes`);
  });
});
