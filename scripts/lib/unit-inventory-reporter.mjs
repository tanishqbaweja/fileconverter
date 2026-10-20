// Bounded diagnostic reporter; never changes test selection, skips or outcomes.
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";

export default async function* report(source) {
  const files = new Map(), summaries = [], startedAt = new Date().toISOString();
  for await (const event of source) {
    const data = event.data;
    if (event.type === "test:pass" || event.type === "test:fail") {
      const file = data.file ? path.relative(process.cwd(), data.file).replaceAll("\\", "/") : "unknown";
      if (!files.has(file)) files.set(file, { file, passed: 0, failed: 0, skipped: 0, examples: [] });
      assert.ok(files.size <= 1024, "Unexpected unit inventory growth");
      const row = files.get(file);
      if (data.skip) row.skipped++;
      else if (event.type === "test:pass") row.passed++;
      else {
        row.failed++;
        if (row.examples.length < 3) {
          const error = data.details?.error;
          row.examples.push({ name: String(data.name).slice(0, 256), nesting: data.nesting,
            failureType: error?.failureType ?? null, code: error?.cause?.code ?? error?.code ?? null,
            message: String(error?.cause?.message ?? error?.message ?? "Unknown failure").slice(0, 2048) });
        }
      }
    }
    if (event.type === "test:summary") {
      summaries.push(data); assert.ok(summaries.length <= 1024);
    }
  }
  const output = process.env.WITHIN_UNIT_INVENTORY_REPORT;
  assert.ok(output && path.isAbsolute(output));
  const result = { startedAt, finishedAt: new Date().toISOString(), cwd: process.cwd(),
    allEventsConsumed: true, diagnosticOnly: true, files: [...files.values()].sort((a,b) => a.file.localeCompare(b.file)), summaries };
  await writeFile(output, JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
  yield JSON.stringify({ report: output, files: files.size, failingFiles: result.files.filter(row => row.failed).length,
    skippedCases: result.files.reduce((sum,row) => sum + row.skipped, 0), summary: summaries.at(-1) }) + "\n";
}
