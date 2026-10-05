import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { provenSourceSha } from "./helpers/nondocker-workflow-provenance.mjs";

test("Historical build workflow provenance reverses only one diagnostic artifact line", async () => {
  const file = ".github/workflows/reproduce-ffmpeg-nondocker.yml";
  const old = "5a0d4a2a4357abae5715363367aef69c400e584b49836c645eae0e08d5c587c6";
  const bytes = await readFile(new URL(`../${file}`, import.meta.url));
  const line = "            work/mpeg2-candidate-output/refstruct-diagnostic-smoke.json\n";
  assert.equal(provenSourceSha(file, bytes, old), old);
  assert.equal(provenSourceSha(file, Buffer.from(bytes.toString().replace(line, "")), old), old);
  assert.throws(() => provenSourceSha(file, Buffer.concat([bytes, Buffer.from("# changed build\n")]), old));
  assert.throws(() => provenSourceSha(file, Buffer.concat([bytes, Buffer.from(line)]), old));
  assert.notEqual(provenSourceSha("unrelated", bytes, old), old);
});
