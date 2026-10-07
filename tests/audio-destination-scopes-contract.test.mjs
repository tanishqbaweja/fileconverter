import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { conversionProfiles } from "../lib/capability-registry.ts";

const source = await readFile(new URL("./browser/audio-destination-scopes.spec.ts", import.meta.url), "utf8");
test("new destination-scope harness targets eight existing public implementations", () => {
  const rows = [...source.matchAll(/\{ source: "(\w+)", destination: "(\w+)" \}/g)];
  assert.equal(rows.length, 8);
  const ids = rows.map(row => `${row[1]}-to-${row[2]}`);
  assert.equal(new Set(ids).size, 8);
  for (const id of ids) {
    const profile = conversionProfiles.find(candidate => candidate.id === id);
    assert.ok(profile?.public, id);
    assert.equal(profile.automatedTestStatus, "passed", id);
  }
});
test("scope checks cannot merge tags or substitute another stream", () => {
  assert.ok(source.includes('scope: source.scope'));
  assert.ok(source.includes('scope: "audio-stream"'));
  assert.ok(source.includes('scope: "format"'));
  assert.ok(source.includes('wrongScope.fields.every(field => field.status === "missing")'));
  assert.ok(source.includes('changed.fields[0].status).toBe("changed")'));
  assert.ok(!source.includes("tags ??"));
});
test("validation copies remain bounded and own scratch is removed on every exit", () => {
  assert.ok(source.includes("file.slice(offset, offset + count).arrayBuffer()"));
  assert.ok(!source.includes("file.arrayBuffer()"));
  assert.ok(source.includes("chunkBytes = 65536"));
  assert.ok(source.includes('open(output, "wx")'));
  assert.ok(source.includes("written += result.bytesWritten"));
  assert.ok(source.includes("finally { await writer.close(); }"));
  assert.ok(source.includes('mkdtemp(path.join(work, "audio-destination-scopes-"))'));
  assert.ok(source.includes("expect(path.dirname(directory)).toBe(work)"));
  assert.ok(source.includes("await rm(directory, { recursive: true, force: true })"));
  assert.ok(source.includes("remainingOpfsEntries = remaining"));
  assert.ok(source.includes('"-xerror", "-i", output'));
  for (const field of ["completeChromiumMemoryAcceptance", "lossyQualityAcceptance",
    "artworkAcceptance", "scalingAcceptance", "publicAcceptance"])
    assert.ok(source.includes(`${field}: false`));
});
test("new harness parses as TypeScript; this is not browser execution evidence", () => {
  const result = ts.transpileModule(source, { fileName: "audio-destination-scopes.spec.ts",
    reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
  assert.deepEqual(result.diagnostics, []);
});
test("CI can run this suite alone without engine rebuilds or unrelated browser suites", async () => {
  const workflow = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  assert.ok(workflow.includes("inputs.engine != 'verify-only' && inputs.engine != 'audio-destination-scopes'"));
  assert.ok(workflow.includes("- audio-destination-scopes"));
  const narrow = workflow.slice(workflow.indexOf("  audio-destination-scopes:\n"));
  assert.ok(narrow.includes("github.event_name == 'workflow_dispatch' && inputs.engine == 'audio-destination-scopes'"));
  assert.ok(narrow.includes("test tests/browser/audio-destination-scopes.spec.ts"));
  assert.ok(!narrow.includes("reproduce-nondocker"));
  assert.ok(!narrow.includes("docker build"));
  assert.ok(narrow.includes('mktemp -d "$GITHUB_WORKSPACE/work/t.XXXXXX"'));
  assert.ok(narrow.includes("path: output/playwright/audio-destination-scopes-*.json"));
  assert.ok(narrow.includes("retention-days: 1"));
  for (const owned of ["audio-scope-npm-cache", "audio-scope-browsers"])
    assert.ok(narrow.includes(`$GITHUB_WORKSPACE/work/${owned}`));
});
