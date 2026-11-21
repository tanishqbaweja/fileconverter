import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { DOCX_COLOR_CASES, docxColorOracleCases } from "../scripts/lib/docx-color-oracle-controls.mjs";
import { preDocxColorDriver } from "../scripts/lib/reviewed-docx-color-driver.mjs";

const driver = await readFile("scripts/qualify-docx-html.mjs");
test("color browser gate shares the strict repeat/adverse-path pipeline and refuses unsafe system disk before launch", () => {
  const source = driver.toString();
  assert.ok(source.includes('const colorControl = process.argv[2] === "--color-control"'));
  assert.match(source, /const tableSmall = [^;]+\|\| colorControl;/);
  assert.match(source, /const payloadControl = [^;]+\|\| tableSmall;/);
  assert.ok(source.indexOf("systemDisk = await statfs") < source.indexOf("report.hostMemory = await inspectStressHostMemory"));
  assert.ok(source.indexOf("systemDisk = await statfs") < source.indexOf("chrome = spawn("));
  for (const required of ["DOCX_COLOR_SYSTEM_DISK_MINIMUM_BYTES", "docxColorOracleCases(referenceHtml)",
    "scripts/lib/docx-color-fixtures.py", "workers/docx-colors.ts", "validated.semanticCases, DOCX_COLOR_CASES",
    "passed-private-docx-color-and-recovery-not-scaling-or-promotion", "caseRow.smallRunMemory.incrementalPrivateMiB <= 250",
    "caseRow.smallRunMemory.cleanupDeltaFromLoadedMiB <= scalingPlan.cleanupRecoveryLimitMiB", "assert.deepEqual(report.forbiddenRequests, [])"])
    assert.ok(source.includes(required), required);
  assert.equal(DOCX_COLOR_CASES, 14);
});

test("offline oracle requires all independent anchors and produces distinct negative controls", () => {
  const reference = 'Default α<strong>Character style</strong>color:#4f81bd color:CanvasText color:#95b3d7 color:#225544 After the payload color:#112233</body>';
  const cases = docxColorOracleCases(reference);
  assert.equal(cases.length, 11);
  assert.deepEqual(cases[0], ["positive", reference, true]);
  assert.ok(cases.slice(1).every(([, contents, expected]) => contents !== reference && expected === false));
  assert.equal(new Set(cases.map(c => c[1])).size, cases.length);
  assert.throws(() => docxColorOracleCases(reference.replace("color:#95b3d7", "")), /mutation anchor: wrong-tint/);
});

test("previous hyperlink harness is authenticated without rewriting its receipts or accepting unknown driver bytes", () => {
  const old = preDocxColorDriver(driver);
  assert.notEqual(old, driver);
  const unreviewed = Buffer.concat([driver, Buffer.from("\n// unrelated\n")]);
  assert.equal(preDocxColorDriver(unreviewed), unreviewed);
  assert.equal(preDocxColorDriver(old), old);
  assert.doesNotMatch(old.toString(), /--color-control/);
});
