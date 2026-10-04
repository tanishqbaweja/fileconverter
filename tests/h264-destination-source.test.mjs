import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("private direct H264 gate selects the production handle path with original long quality, memory and cleanup constraints", async () => {
  const source = await readFile(new URL("../scripts/h264-private-memory.mjs", import.meta.url), "utf8");
  assert.match(source, /WITHIN_H264_DESTINATION_MODE/);
  assert.match(source, /\["sync-opfs", "direct-handle"\]/);
  assert.match(source, /direct-handle" \? "\/\?test=1&directory=1"/);
  assert.equal((source.match(/page.goto\(`\$\{url\}\$\{testQuery\}`\)/g) ?? []).length, 3);
  assert.match(source, /assert.equal\(manifest.allocatorDiagnostic, false/);
  assert.match(source, /assert.equal\(stressProfile.name, "startup-scaling"\)/);
  assert.match(source, /assert.equal\(state.opfsName, null/);
  assert.match(source, /const runCount = 3/);
  assert.match(source, /summary.incrementalPrivateMiB <= 250/);
  assert.match(source, /ordinalSsim >= 0.98/);
  assert.match(source, /not a native OS picker\/manual drive audit/);
  assert.match(source, /await rm\(work, \{ recursive: true/);
  const app = await readFile(new URL("../app/converter/ConverterApp.tsx", import.meta.url), "utf8");
  assert.match(app, /destinationDirectoryHandle: testDirectoryMode/);
  assert.match(app, /destination = destinationForHandle\(available.handle\)/);
  assert.match(app, /return \{ mode: "handle", handle \}/);
});
test("small H264 correctness reports select the exact tool and never mix historical rows under a new manifest", async () => {
  const source = await readFile(new URL("../tests/browser/h264-candidate.spec.ts", import.meta.url), "utf8");
  assert.match(source, /candidateDirectory\(root, candidateName\)/);
  assert.match(source, /candidateName, rows/);
  assert.match(source, /flag: "wx"/);
  assert.doesNotMatch(source, /combinedRows|previous.rows/);
  assert.match(source, /destination rejected a bounded write/);
});
