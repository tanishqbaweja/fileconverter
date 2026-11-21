import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { DOCX_COLOR_CASES, DOCX_PARAGRAPH_ALIGNMENT_CASES, DOCX_COLOR_ALIGNMENT_FIXTURE_FLAG, DOCX_RUN_VERTICAL_FIXTURE_FLAG, docxColorOracleCases } from "../scripts/lib/docx-color-oracle-controls.mjs";
import { preDocxColorAlignmentDriver, preDocxColorDriver, preDocxRunVerticalDriver } from "../scripts/lib/reviewed-docx-color-driver.mjs";

const driver = await readFile("scripts/qualify-docx-html.mjs");
test("color browser gate shares the strict repeat/adverse-path pipeline and refuses unsafe system disk before launch", () => {
  const source = driver.toString();
  assert.ok(source.includes('const colorControl = process.argv[2] === "--color-control"'));
  assert.match(source, /const tableSmall = [^;]+\|\| colorControl;/);
  assert.match(source, /const payloadControl = [^;]+\|\| tableSmall;/);
  assert.ok(source.indexOf("systemDisk = await statfs") < source.indexOf("report.hostMemory = await inspectStressHostMemory"));
  assert.ok(source.indexOf("systemDisk = await statfs") < source.indexOf("chrome = spawn("));
  for (const required of ["DOCX_COLOR_SYSTEM_DISK_MINIMUM_BYTES", "docxColorOracleCases(referenceHtml, { checkAlignment: colorAlignmentControl, checkVertical: runVerticalControl })",
    "scripts/lib/docx-color-fixtures.py", "workers/docx-colors.ts", "validated.semanticCases, DOCX_COLOR_CASES",
    "passed-private-docx-color-and-recovery-not-scaling-or-promotion", "caseRow.smallRunMemory.incrementalPrivateMiB <= 250",
    "caseRow.smallRunMemory.cleanupDeltaFromLoadedMiB <= scalingPlan.cleanupRecoveryLimitMiB", "assert.deepEqual(report.forbiddenRequests, [])"])
    assert.ok(source.includes(required), required);
  assert.equal(DOCX_COLOR_CASES, 14);
});

test("combined alignment mode applies the same fixture variant to generation, reference and physical output oracles", () => {
  const source = driver.toString();
  const required = [
    'process.argv[2] === "--color-alignment-control"', 'process.argv[2] === "--color-control" || colorAlignmentControl',
    'semanticFixtureArgs("generate", input)', 'semanticFixtureArgs("reference")', 'semanticFixtureArgs("validate", file)',
    "colorAlignmentControl ? [DOCX_COLOR_ALIGNMENT_FIXTURE_FLAG] : []",
    "validated.alignmentCases, DOCX_PARAGRAPH_ALIGNMENT_CASES",
    "validated.allParagraphAlignmentAndStructureVerified, true",
    'passed-private-docx-color-alignment-and-recovery-not-scaling-or-promotion',
    "process.env.WITHIN_DOCX_FIXTURE_PYTHON",
  ];
  for (const fragment of required) assert.ok(source.includes(fragment), fragment);
  assert.equal(DOCX_PARAGRAPH_ALIGNMENT_CASES, 6);
  assert.equal(DOCX_COLOR_ALIGNMENT_FIXTURE_FLAG, "--paragraph-alignment");
});

test("offline oracle requires all independent anchors and produces distinct negative controls", () => {
  const reference = 'Default α<strong>Character style</strong>color:#4f81bd color:CanvasText color:#95b3d7 color:#225544 After the payload color:#112233</body>';
  const cases = docxColorOracleCases(reference);
  assert.equal(cases.length, 11);
  assert.deepEqual(cases[0], ["positive", reference, true]);
  assert.ok(cases.slice(1).every(([, contents, expected]) => contents !== reference && expected === false));
  assert.equal(new Set(cases.map(c => c[1])).size, cases.length);
  assert.throws(() => docxColorOracleCases(reference.replace("color:#95b3d7", "")), /mutation anchor: wrong-tint/);
  const combined = reference + '<p style="text-align:center">text-align:right"><span style="color:#225544"' +
    'text-align:left"><span style="color:#4f81bd" white-space:pre-wrap;text-align:justify שלום 123 English';
  const combinedCases = docxColorOracleCases(combined, { checkAlignment: true });
  assert.equal(combinedCases.length, 16);
  assert.equal(new Set(combinedCases.map(c => c[1])).size, 16);
  assert.ok(combinedCases.slice(1).every(([, content, expected]) => content !== combined && expected === false));
  assert.throws(() => docxColorOracleCases(reference, { checkAlignment: true }), /mutation anchor: lost-inherited-alignment/);
  const vertical = combined.replace("Default α", "<sup>Default α</sup>")
    .replace("<strong>Character style</strong>", "<strong><sup>Character style</sup></strong>") +
    "<sub>Inherited paragraph</sub><strong>Direct override</strong><sub>Mapped text1</sub>";
  assert.throws(() => docxColorOracleCases(vertical, { checkVertical: true }));
  const verticalCases = docxColorOracleCases(vertical, { checkAlignment: true, checkVertical: true });
  assert.equal(verticalCases.length, 20);
  assert.equal(new Set(verticalCases.map(c => c[1])).size, 20);
  assert.ok(verticalCases.slice(1).every(([, content, expected]) => content !== vertical && expected === false));
});

test("combined vertical gate checks inheritance and explicit reset on the physical browser output", () => {
  const source = driver.toString();
  for (const required of ['process.argv[2] === "--color-alignment-vertical-control"',
    "runVerticalControl ? [DOCX_RUN_VERTICAL_FIXTURE_FLAG] : []", "tableFixture.expectedVerticalSegments, DOCX_COLOR_CASES",
    "validated.verticalSegments, DOCX_COLOR_CASES", "validated.allRunVerticalAlignmentVerified, true",
    "passed-private-docx-color-alignment-vertical-and-recovery-not-scaling-or-promotion"]) assert.ok(source.includes(required), required);
  assert.equal(DOCX_RUN_VERTICAL_FIXTURE_FLAG, "--run-vertical");
  const archived = preDocxRunVerticalDriver(driver);
  assert.notDeepEqual(archived, driver);
  assert.doesNotMatch(archived.toString(), /--color-alignment-vertical-control/);
  assert.equal(preDocxRunVerticalDriver(archived), archived);
});

test("previous hyperlink harness is authenticated without rewriting its receipts or accepting unknown driver bytes", () => {
  const old = preDocxColorDriver(driver);
  const colorOnly = preDocxColorAlignmentDriver(driver);
  assert.notDeepEqual(colorOnly, driver);
  assert.match(colorOnly.toString(), /--color-control/);
  assert.doesNotMatch(colorOnly.toString(), /--color-alignment-control/);
  assert.notEqual(old, driver);
  const unreviewed = Buffer.concat([driver, Buffer.from("\n// unrelated\n")]);
  assert.equal(preDocxColorDriver(unreviewed), unreviewed);
  assert.equal(preDocxColorAlignmentDriver(unreviewed), unreviewed);
  assert.equal(preDocxColorDriver(old), old);
  assert.doesNotMatch(old.toString(), /--color-control/);
});
