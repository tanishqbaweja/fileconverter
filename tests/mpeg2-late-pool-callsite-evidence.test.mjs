import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
const root = new URL("../", import.meta.url), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const input = await readFile(new URL("evidence/mpeg2-quiesced-budget-original-2026-10-08.json", root));
const proof = JSON.parse(input);
const report = JSON.parse(await readFile(new URL("evidence/mpeg2-late-pool-callsite-inventory-2026-10-08.json", root)));

test("actual caller offset joins the second of three decoded binary calls, not guessed source ordinal", async () => {
  const inspection = report.inspection;
  assert.equal(report.failure, null); assert.equal(report.input.sha256, sha(input));
  assert.equal(inspection.calls.length, 3);
  assert.deepEqual(inspection.calls.map(row => row.originalOffsetHex), ["0x30b28b", "0x30b508", "0x30b541"]);
  assert.deepEqual(inspection.matchedCall, inspection.calls[1]);
  // The historical field name is sourceSiteOrdinal, but the executed source
  // explicitly retains the COMPILED ordinal only; pool mapping stays unavailable.
  assert.equal(inspection.sourceSiteOrdinal, 1); assert.equal(inspection.inferredFailedPool, null);
  assert.equal(inspection.poolIdentityInference, null); assert.equal(inspection.observedRuntimePoolPointer, null);
  assert.equal(inspection.failedIndividualAllocationBytes, null); assert.equal(inspection.fragmentationProven, false);
  const binary = await readFile(new URL(inspection.binary.path, root));
  assert.equal(sha(binary), inspection.binary.sha256);
  assert.equal(inspection.binary.sha256, proof.actualStackSymbols[0].binarySha256);
  for (const call of inspection.calls) {
    assert.equal(call.targetIndex, 4378); assert.equal(call.instructionHex, "109a22");
    assert.equal(binary.subarray(call.originalOffset, call.originalOffset + 3).toString("hex"), call.instructionHex);
    assert.equal(call.originalOffset - inspection.originalMetadata.bodyStart,
      call.slicedOffset - inspection.slicedMetadata.bodyStart);
  }
  assert.equal(inspection.actualStackCaller.codeOffset, inspection.matchedCall.originalOffsetHex);
  assert.equal(inspection.disassembler.version, "1.0.39");
  assert.equal(inspection.analysisOnlySlice.selectedBodyByteExact, true);
  assert.equal(inspection.analysisOnlySlice.instantiated, false);
  assert.ok(Buffer.byteLength(JSON.stringify(inspection.decodedCallContexts)) <= 32768);
  assert.equal(report.actualConverterFunctionsExecuted, 0); assert.equal(report.publicAcceptance, false);
  await assert.rejects(access(report.cleanup.runtimeDirectory), { code: "ENOENT" });
});

test("failed static assumptions and context escaping remain failures with owned cleanup", async () => {
  for (const name of ["mpeg2-late-pool-callsite-2026-10-08.json", "mpeg2-late-pool-callsite-bounded-2026-10-08.json",
    "mpeg2-late-pool-callsite-inventory-regex-failure-2026-10-08.json"]) {
    const failed = JSON.parse(await readFile(new URL(`evidence/${name}`, root)));
    assert.equal(failed.status, "failed-static-inspection-not-acceptance");
    assert.ok(failed.failure); assert.equal(failed.inspection, null);
    assert.equal(failed.browserConversionsPerformed, 0); assert.equal(failed.originalRead, false);
    assert.equal(failed.cleanup.ownedRuntimeRemoved, true);
    await assert.rejects(access(failed.cleanup.runtimeDirectory), { code: "ENOENT" });
    for (const [file, hash] of Object.entries(failed.sourcePins)) {
      let source = await readFile(new URL(file, root), "utf8");
      if (name.includes("regex-failure")) {
        const fixed = "const match = /^\\s*([0-9a-f]+):/.exec(line);";
        const prior = "const match = /^\\\\s*([0-9a-f]+):/.exec(line);";
        assert.equal(source.split(fixed).length, 2); source = source.replace(fixed, prior);
      }
      assert.equal(sha(source), hash, file);
    }
  }
  for (const [file, hash] of Object.entries(report.sourcePins))
    assert.equal(sha(await readFile(new URL(file, root))), hash, file);
});
