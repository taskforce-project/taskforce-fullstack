import { strict as assert } from "node:assert";
import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  bundleVisualCppRuntime,
  fileVersion,
  linkerVersion,
  peImports,
  requireVisualCppRuntime,
  runtimeSources,
} from "../scripts/postgres-runtime.mjs";

/** Un binaire PE32+ minimal : une section qui porte ses imports, ses imports différés et, au besoin, sa version. */
function pe(options: { imports?: string[]; delayed?: string[]; linker?: [number, number]; version?: number[] }): Buffer {
  const { imports = [], delayed = [], linker = [14, 44], version } = options;
  const file = Buffer.alloc(0x1000);
  const peOffset = 0x40;
  const optional = peOffset + 24;
  const section = optional + 240;
  const rawStart = 0x200;
  const virtualStart = 0x1000;
  const rva = (offset: number) => offset - rawStart + virtualStart;

  file.writeUInt16LE(0x5a4d, 0);
  file.writeUInt32LE(peOffset, 0x3c);
  file.writeUInt32LE(0x00004550, peOffset);
  file.writeUInt16LE(1, peOffset + 6);
  file.writeUInt16LE(240, peOffset + 20);
  file.writeUInt16LE(0x20b, optional);
  file.writeUInt8(linker[0], optional + 2);
  file.writeUInt8(linker[1], optional + 3);
  file.writeUInt32LE(0xe00, section + 8);
  file.writeUInt32LE(virtualStart, section + 12);
  file.writeUInt32LE(0xe00, section + 16);
  file.writeUInt32LE(rawStart, section + 20);

  let cursor = rawStart;
  const directories = optional + 112;
  const table = (names: string[], directory: number, entrySize: number, nameField: number) => {
    if (names.length === 0) return;
    file.writeUInt32LE(rva(cursor), directories + directory * 8);
    const entries = cursor;
    cursor += (names.length + 1) * entrySize;
    names.forEach((name, index) => {
      file.writeUInt32LE(rva(cursor), entries + index * entrySize + nameField);
      file.write(`${name}\0`, cursor, "latin1");
      cursor += name.length + 1;
    });
  };
  table(imports, 1, 20, 12);
  table(delayed, 13, 32, 4);

  if (version) {
    file.writeUInt32LE(0xfeef04bd, 0xe00);
    file.writeUInt32LE(((version[0] << 16) | version[1]) >>> 0, 0xe08);
    file.writeUInt32LE(((version[2] << 16) | version[3]) >>> 0, 0xe0c);
  }
  return file;
}

function bundle(files: Record<string, Buffer>): string {
  const dir = mkdtempSync(join(tmpdir(), "postgres-runtime-"));
  mkdirSync(join(dir, "bin"));
  mkdirSync(join(dir, "lib"));
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
  return dir;
}

function folder(files: Record<string, Buffer>): string {
  const dir = mkdtempSync(join(tmpdir(), "postgres-runtime-source-"));
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
  return dir;
}

const runtime = (imports: string[] = [], version = [14, 44, 35211, 0]) => pe({ imports, version });

describe("peImports", () => {
  it("reads the import table and the delay-loaded imports, in lower case", () => {
    assert.deepEqual(peImports(pe({ imports: ["VCRUNTIME140.dll", "KERNEL32.dll"], delayed: ["MSVCP140.dll"] })), [
      "vcruntime140.dll",
      "kernel32.dll",
      "msvcp140.dll",
    ]);
  });

  it("refuses a file that is not a program", () => {
    assert.throws(() => peImports(Buffer.from("not a program, not even close to 64 bytes long, but long enough to read")));
  });
});

describe("linkerVersion and fileVersion", () => {
  it("reads the toolset of a binary and the version of a DLL", () => {
    assert.deepEqual(linkerVersion(pe({ linker: [14, 44] })), [14, 44]);
    assert.deepEqual(fileVersion(pe({ version: [14, 44, 35211, 0] })), [14, 44, 35211, 0]);
    assert.equal(fileVersion(pe({})), null);
  });
});

describe("bundleVisualCppRuntime", () => {
  it("copies what the binaries import, and what those DLLs import in turn", () => {
    const dir = bundle({
      "bin/initdb.exe": pe({ imports: ["VCRUNTIME140.dll", "KERNEL32.dll"] }),
      "lib/plugin.dll": pe({ imports: ["MSVCP140.dll"] }),
    });
    const source = folder({
      "msvcp140.dll": runtime(["VCRUNTIME140_1.dll"]),
      "vcruntime140.dll": runtime(),
      "vcruntime140_1.dll": runtime(),
      "unrelated.dll": runtime(),
    });
    const result = bundleVisualCppRuntime(dir, [source]);
    assert.equal(result.source, source);
    assert.deepEqual(result.copied.map(({ name }) => name), ["msvcp140.dll", "vcruntime140_1.dll", "vcruntime140.dll"].sort((a, b) => a.localeCompare(b)));
    const copied = readdirSync(join(dir, "bin")).filter((name) => name.endsWith(".dll")).sort();
    assert.deepEqual(copied, ["msvcp140.dll", "vcruntime140.dll", "vcruntime140_1.dll"].sort());
    rmSync(dir, { recursive: true });
    rmSync(source, { recursive: true });
  });

  it("leaves the DLLs of Windows, and those the bundle already has", () => {
    const dir = bundle({
      "bin/initdb.exe": pe({ imports: ["msvcrt.dll", "VCRUNTIME140.dll"] }),
      "bin/vcruntime140.dll": runtime(),
    });
    const source = folder({});
    const result = bundleVisualCppRuntime(dir, [source]);
    assert.equal(result.source, source);
    assert.deepEqual(result.copied, []);
    rmSync(dir, { recursive: true });
    rmSync(source, { recursive: true });
  });

  it("copies nothing with --check", () => {
    const dir = bundle({ "bin/initdb.exe": pe({ imports: ["VCRUNTIME140.dll"] }) });
    const source = folder({ "vcruntime140.dll": runtime() });
    assert.deepEqual(bundleVisualCppRuntime(dir, [source], { check: true }).copied.map(({ name }) => name), ["vcruntime140.dll"]);
    assert.deepEqual(readdirSync(join(dir, "bin")), ["initdb.exe"]);
    rmSync(dir, { recursive: true });
    rmSync(source, { recursive: true });
  });

  it("takes the whole runtime from the first folder that has it recent enough", () => {
    const dir = bundle({ "bin/initdb.exe": pe({ imports: ["VCRUNTIME140.dll"], linker: [14, 44] }) });
    const old = folder({ "vcruntime140.dll": runtime([], [14, 37, 0, 0]) });
    const fresh = folder({ "vcruntime140.dll": runtime([], [14, 44, 35211, 0]) });
    const result = bundleVisualCppRuntime(dir, [old, fresh]);
    assert.equal(result.source, fresh);
    assert.match(result.refused[0], /14\.37\.0\.0, older than the toolset 14\.44/);
    rmSync(dir, { recursive: true });
    rmSync(old, { recursive: true });
    rmSync(fresh, { recursive: true });
  });
});

describe("runtimeSources", () => {
  it("keeps the embedded Java as the last resort", () => {
    assert.equal(runtimeSources("the-java-bin").at(-1), "the-java-bin");
  });
});

describe("requireVisualCppRuntime", () => {
  it("stops the build and names the missing DLL with what imports it", () => {
    const dir = bundle({ "bin/icuuc77.dll": pe({ imports: ["MSVCP140.dll"] }) });
    const source = folder({ "vcruntime140.dll": runtime() });
    assert.throws(() => requireVisualCppRuntime(dir, [source]), /msvcp140\.dll is missing \(imported by icuuc77\.dll\)/);
    rmSync(dir, { recursive: true });
    rmSync(source, { recursive: true });
  });

  it("stops the build and names a DLL older than the toolset of what imports it", () => {
    const dir = bundle({ "bin/initdb.exe": pe({ imports: ["VCRUNTIME140.dll"], linker: [14, 44] }) });
    const source = folder({ "vcruntime140.dll": runtime([], [14, 37, 0, 0]) });
    assert.throws(() => requireVisualCppRuntime(dir, [source]), /vcruntime140\.dll is 14\.37\.0\.0, older than the toolset 14\.44/);
    rmSync(dir, { recursive: true });
    rmSync(source, { recursive: true });
  });
});
