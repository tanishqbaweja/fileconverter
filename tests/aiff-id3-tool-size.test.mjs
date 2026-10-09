import assert from "node:assert/strict";
import test from "node:test";
import { readFile, lstat } from "node:fs/promises";
import { aiffId3ToolSizeLimit } from "../scripts/lib/aiff-id3-tool-size.mjs";

test("AIFF artifact size bound admits the existing public module, not unbounded tool growth", async () => {
  const info = await lstat(new URL("../public/engines/remux/within-aiff.wasm", import.meta.url));
  assert.equal(info.size, 8793240);
  assert.ok(info.size > 8 * 1024 ** 2, "Initial blanket 8 MiB limit was already smaller than published Wasm");
  const limit = aiffId3ToolSizeLimit("within-aiff.wasm", info.size);
  assert.equal(limit, info.size + 1024 ** 2);
  assert.ok(info.size <= limit);
  for (const name of ["within-aiff.mjs", "build-manifest.json", "within_aiff.c", "LICENSE.opus"])
    assert.equal(aiffId3ToolSizeLimit(name, info.size), 1024 ** 2);
  for (const invalid of [0, -1, NaN, Infinity, 12 * 1024 ** 2, 1.5])
    assert.throws(() => aiffId3ToolSizeLimit("within-aiff.wasm", invalid));
});

test("Collector keeps all source, artifact, ownership, and actual Wasm bounds independent of download size", async () => {
  const source = await readFile(new URL("../scripts/collect-aiff-id3-build.mjs", import.meta.url), "utf8");
  for (const token of ["aiffId3ToolSizeLimit", "maximumMetadataModuleGrowthBytes", "files.reduce", "16 * 1024 ** 2",
    "info.isFile()", "!info.isSymbolicLink()", "names.length, 12", "initialPages: 256, maximumPages: 512",
    "PUBLISHED_AIFF_SOURCE_SHA256", "branch.commit", "COPYFILE_EXCL", "await runtime.close()", "windowsHide: true"])
    assert.ok(source.includes(token), token);
});
