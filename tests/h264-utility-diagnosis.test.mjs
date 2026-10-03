import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const evidence = JSON.parse(await readFile(new URL("../evidence/h264-utility-diagnosis-2026-10-04.json", import.meta.url)));
test("the large model service is observed without a file and without loading the converter", () => {
  assert.equal(evidence.publicAcceptance, false);
  assert.equal(evidence.historical32MiBRejectionUnchanged, true);
  assert.equal(evidence.conversion, null);
  for (const trial of [evidence.idle, evidence.blankOnly]) {
    assert.equal(trial.status, "completed-diagnostic");
    const model = trial.activity.utilities.find((entry) => entry.utilitySubtype === "on_device_model.mojom.OnDeviceModelService");
    assert.ok(model.peakPrivateBytes > 200 * 1024 ** 2);
    assert.ok(model.browserAgeAtProcessCreationMs >= 170_000 && model.browserAgeAtProcessCreationMs <= 190_000);
    assert.equal(trial.cleanup.ownedProfileTempAndServerRemoved, true);
    for (const phase of trial.activity.phases) {
      assert.ok(phase.availableSamples >= 100);
      assert.equal(phase.peakSample.privateBytes, phase.peakSample.processes.reduce((sum, entry) => sum + entry.privateBytes, 0));
    }
  }
  assert.deepEqual(evidence.blankOnly.activity.phases.map((phase) => phase.phase), ["blank-only"]);
  assert.ok(evidence.blankOnly.scope.includes("no production site loaded"));
});

test("diagnostic evidence is bound to the current executed script and recorder, not a retroactive encoder pass", async () => {
  const hashes = { ...evidence.recordingSources, ...evidence.blankOnly.sourceHashesAsExecuted };
  for (const [file, expected] of Object.entries(hashes)) {
    assert.equal(createHash("sha256").update(await readFile(new URL(`../${file}`, import.meta.url))).digest("hex"), expected, file);
  }
  const source = await readFile(new URL("../scripts/diagnose-chromium-utility.mjs", import.meta.url), "utf8");
  assert.ok(source.includes("blankOnly ? 240_000 : 120_000"));
  assert.ok(source.includes("NOT a replacement/larger acceptance baseline"));
  assert.ok(!source.includes("DOM.setFileInputFiles"));
  assert.ok(!source.includes("OptimizationGuideModelExecution,"));
});
