import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import test from "node:test";
import { readPreSessionRecoverySampler, readHistoricalCdpOrFile } from "./helpers/historical-cdp-realm.mjs";
import { readHistoricalUiOrArtifact } from "./helpers/historical-published-ui.mjs";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
test("historical adapter retains the one exact executed sampler while live source stays independently repaired", async () => {
  const file = new URL("../scripts/lib/cdp-realm-memory.mjs", import.meta.url), old = await readPreSessionRecoverySampler("scripts/lib/cdp-realm-memory.mjs");
  assert.equal(old.length, 4791); assert.equal(sha(old), "046b122ebb37935de6e5b75ebc59f0fd16ea6837c8aea0d75e0bbd70f1eb799f");
  assert.notEqual(sha(await readFile(file)), sha(old));
  assert.deepEqual(await readHistoricalCdpOrFile(file), old); assert.equal(await readHistoricalCdpOrFile(file, "utf8"), old.toString());
  assert.deepEqual(await readHistoricalUiOrArtifact(file), old);
  await assert.rejects(readPreSessionRecoverySampler("workers/conversion.worker.ts"), /Only the exact historical/);
  const unrelated = new URL("../images/resvg-source/processed-candidate-input.json", import.meta.url);
  assert.deepEqual(await readHistoricalCdpOrFile(unrelated), await readFile(unrelated));
  const missing = new URL("../fixtures/source/does-not-exist-cdp-test.json", import.meta.url);
  await assert.rejects(readHistoricalCdpOrFile(missing), { code: "ENOENT" });
});
