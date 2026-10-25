import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadArtworkSerializerBenchmark, summarizeArtworkSerializerBenchmarks } from "./lib/audio-artwork-serializer-benchmark.mjs";
const root = path.resolve(import.meta.dirname, ".."), receipts = process.argv.slice(2); assert.equal(receipts.length, 4);
const startedAt = new Date().toISOString(), loaded = [];
for (const file of receipts) loaded.push(await loadArtworkSerializerBenchmark(root, file));
const report = { startedAt, ...summarizeArtworkSerializerBenchmarks(loaded.map(row => row.report)), evidence: loaded.map(row => row.evidence) };
const destination = path.join(root, "outputs/reports", startedAt.replaceAll(":", "-") + "-audio-artwork-serializer-browser-comparison.json");
await mkdir(path.dirname(destination), { recursive: true }); await writeFile(destination, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ report: destination, status: report.status, engineTiming: report.engineTiming, browserWallTiming: report.browserWallTiming,
  conclusion: report.conclusion, runs: report.runs.map(run => ({ engine: run.engine, memoryMiB: run.incrementalPrivateMiB })) }));
