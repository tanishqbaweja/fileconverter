import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { withPacketOrderProbe } from "../scripts/lib/packet-order-pair-probe.mjs";
import { makePacketOrderMediaComponents } from "../scripts/lib/packet-order-pair-media-recipe.mjs";
import { makePacketOrderMediaCaller } from "../scripts/lib/packet-order-pair-caller-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file), "utf8");
test("additional independent packet/video/box diagnostics preserve every original assertion and finally", async () => {
  const original = await read("tests/browser/mpeg2-split-direct-candidate.spec.ts"), probe = withPacketOrderProbe(original);
  assert.ok(probe.includes('"-show_data_hash", "sha256"')); assert.ok(probe.includes('"-c:v", "rawvideo"'));
  assert.ok(probe.includes("maximumBoxHeaderBytes: 16")); assert.ok(probe.includes("packetProof.packets.length).toBeLessThanOrEqual(1024)"));
  assert.ok(probe.includes("finally { await boxFile.close(); }"));
  assert.equal(probe.slice(probe.indexOf("      rows.push({ kind: \"independent-pre-assertion-probes\"")),
    original.slice(original.indexOf("      rows.push({ kind: \"independent-pre-assertion-probes\"")));
});
test("both fully qualified variants retain original four-case inspectors and source caps", async () => {
  for (const variant of ["baseline", "candidate"]) {
    const components = makePacketOrderMediaComponents(await read("scripts/lib/ebml-reuse-media-recipe.mjs"), root, variant);
    const caller = makePacketOrderMediaCaller(await read("scripts/qualify-ebml-reuse-media.mjs"), root, variant);
    for (const source of [components.generated, caller.generated]) {
      const checked = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: source, encoding: "utf8", windowsHide: true, timeout: 5000 });
      assert.equal(checked.status, 0, checked.stderr);
    }
    assert.ok(components.generated.includes("spec:withPacketOrderProbe(old.spec)"));
    assert.ok(components.generated.includes("REALLOC_MEDIA_INSPECTOR_SOURCE"));
    assert.ok(caller.generated.includes("supplemental.length<=128"));
    assert.ok(caller.generated.includes("raw.length<=2097152"));
  }
});
