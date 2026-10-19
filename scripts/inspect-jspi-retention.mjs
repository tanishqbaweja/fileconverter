// Bounded read-only attribution of retained process bytes, not allocation proof.
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { wmiBirthKey } from "./lib/jspi-retention-attribution.mjs";
const terminal = JSON.parse(await readFile("evidence/2026-10-18T23-55-28-649Z-jspi-ssim-full-terminal.json"));
const report = JSON.parse(gunzipSync(await readFile(terminal.report.path), { maxOutputLength: 33554432 }));
const identities = report.nativeMemory.identities;
if (process.argv[2] === "--births") {
  console.log(JSON.stringify([18460,33852,3164].map(pid => ({ pid,
    native: identities.filter(row => row.pid === pid).map(row => row.createdAt),
    cim: [...new Set(report.samples.flatMap(sample => (sample.processes ?? []).filter(row => row.pid === pid).map(row => row.createdAt)))] })), null, 2));
  process.exit(0);
}
const types = new Map();
for (const sample of report.samples) for (const row of sample.processes ?? []) types.set(wmiBirthKey(row), row.type);
const processRows = row => row?.[7]?.map(([id, privateBytes, rssBytes]) => {
  const identity = identities[id]; return { id, pid: identity.pid, createdAt: identity.createdAt,
    type: types.get(wmiBirthKey(identity)) ?? identity.type, privateBytes, rssBytes };
}) ?? null;
const phases = report.nativeMemory.phases.filter(row => /^(loaded-idle|cleanup-[123])$/.test(row.phase));
console.log(JSON.stringify({ phases: phases.map(row => ({ phase: row.phase, keys: Object.keys(row),
  peakPrivateBytes: row.peak[3], lastPrivateBytes: row.last[3], lastAt: row.last[1], processes: processRows(row.last) })),
  samplePhases: [...new Set(report.samples.map(row => row.phase))],
  sampleKeys: Object.keys(report.samples[0]), realm: report.samples.at(-1).cdpIsolateHeaps,
  dom: report.samples.at(-1).dom,
  workerSummary: report.progressProbe.handoffWorkerEventSummary,
  cacheEvents: report.progressProbe.compiledCacheEvents.map(({ event, role, modules }) => ({ event, role, modules })) }, null, 2));
