// This measures matched source inspection in Node, not conversion performance.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { performance } from "node:perf_hooks";
import {
  countTransportPrefixAllocations,
  observedTransportBlob,
  transportInspectionFixtures,
} from "./lib/transport-inspection-fixtures.mjs";

const sourcePath = "lib/media-source-inspection.ts";
const baselineHead = "b37ea3ffed9e8bf838468409f117d2dd33365a58";
const root = new URL("../", import.meta.url);
const baselineSource = execFileSync("git", ["show", `${baselineHead}:${sourcePath}`], {
  cwd: root, encoding: "utf8", windowsHide: true,
});
const currentSource = await readFile(new URL(sourcePath, root), "utf8");
const hash = (value) => createHash("sha256").update(value).digest("hex");
const load = async (source) => {
  const js = stripTypeScriptTypes(source, { mode: "strip" });
  return (await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`)).inspectMediaSource;
};
const old = await load(baselineSource);
const current = await load(currentSource);
const tests = await transportInspectionFixtures();
const samples = 20;
const warmup = 32;
const iterations = 24;
const percentile = (values, p) => {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.ceil(ordered.length * p) - 1];
};
const results = [];
for (const { name, bytes } of tests) {
  const srcOld = observedTransportBlob(bytes);
  const srcNew = observedTransportBlob(bytes);
  const previous = await countTransportPrefixAllocations(old, srcOld);
  const next = await countTransportPrefixAllocations(current, srcNew);
  assert.deepEqual(next.inspection, previous.inspection, name);
  assert.deepEqual(srcNew.reads, srcOld.reads, name);

  const times = { baseline: [], candidate: [] };
  const blob = new Blob([bytes]);
  for (let i = 0; i < warmup; i += 1) {
    await old(blob, "mpeg-ts");
    await current(blob, "mpeg-ts");
  }
  for (let i = 0; i < samples; i += 1) {
    for (const label of i % 2 === 0 ? ["baseline", "candidate"] : ["candidate", "baseline"]) {
      const inspect = label === "baseline" ? old : current;
      const start = performance.now();
      for (let j = 0; j < iterations; j += 1) await inspect(blob, "mpeg-ts");
      times[label].push((performance.now() - start) / iterations);
    }
  }
  results.push({
    name, bytes: bytes.length, sha256: hash(bytes), readRanges: srcNew.reads,
    identicalInspection: true, inspectionSha256: hash(JSON.stringify(next.inspection)),
    scratchPrefixAllocations: { baseline: previous.allocations, candidate: next.allocations },
    msPerInspection: Object.fromEntries(Object.entries(times).map(([name, values]) =>
      [name, { median: percentile(values, 0.5), p90: percentile(values, 0.9), batches: values }])),
  });
}
console.log(JSON.stringify({
  scope: "matched Node source-inspection only; no browser conversion, memory gate, or end-to-end speed claim",
  node: process.version, platform: process.platform, arch: process.arch,
  baselineHead, baselineSourceSha256: hash(baselineSource), candidateSourceSha256: hash(currentSource),
  samples, warmup, iterations, results,
}, null, 2));
