import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { GENERATED_LEDGER_BEGIN as begin, GENERATED_LEDGER_END as end,
  regenerateTestedLedgerPreservingNotes as regenerate, testedLedgerMargins } from "../scripts/lib/tested-ledger-notes.mjs";
const footer = "Exact last generated paragraph.";
const generated = `# Tested conversion ledger\n\nUpdated today from the capability registry, verified.\n\nNew matrix\n\n${footer}\n`;
test("legacy ledger preserves every prefix/suffix byte and migration is repeatable", () => {
  const prefix = "\r\nHandwritten latest result 音楽\r\n\r\n", suffix = "\r\n\r\nHandwritten final result\r\n";
  const previous = "# Tested conversion ledger\r\n" + prefix + "Updated yesterday from the capability registry, old.\nOLD\n" + footer + suffix;
  const next = regenerate(previous, generated, footer);
  assert.deepEqual(testedLedgerMargins(next, footer), { prefix, suffix });
  assert.equal(regenerate(next, generated, footer), next);
  assert.ok(next.includes("New matrix")); assert.ok(!next.includes("OLD"));
});
test("missing, duplicated or reversed markers and unknown legacy boundaries fail closed", () => {
  for (const body of [begin, end, end + begin, begin + end + end, begin + begin + end,
    "Updated yesterday from the capability registry, old.\n" + footer + footer, "Unrecognized text"])
    assert.throws(() => regenerate("# Tested conversion ledger\n" + body, generated, footer));
  assert.throws(() => regenerate("Wrong heading\n", generated, footer));
  assert.throws(() => regenerate("", generated.replace(footer, "wrong"), footer));
  assert.throws(() => regenerate("# Tested conversion ledger\n## What the labels mean\nUpdated today from the capability registry, old.\n" + footer, generated, footer));
});
test("fresh ledger gets explicit boundaries", () => {
  const next = regenerate("", generated, footer);
  assert.equal(next.split(begin).length, 2); assert.equal(next.split(end).length, 2);
  assert.equal(regenerate(next, generated, footer), next);
});
test("actual ledger regeneration retains handwritten margins and manual middle block", async () => {
  const current = await readFile("TESTED.md", "utf8"), generator = await readFile("scripts/generate-tested-ledger.mjs", "utf8");
  const match = /const aiffSpecialistNote =\r?\n  ("(?:[^"\\]|\\.)*");/.exec(generator);
  assert.ok(match); const finalNote = JSON.parse(match[1]);
  const margins = testedLedgerMargins(current, finalNote);
  assert.ok(margins.prefix.length > 600000); assert.ok(margins.suffix.length > 17000);
  const manual = /<!-- BEGIN MANUAL TEST LOG -->[\s\S]*?<!-- END MANUAL TEST LOG -->/.exec(current)?.[0];
  assert.ok(manual);
  const next = regenerate(current, `# Tested conversion ledger\n\nUpdated today from the capability registry, test.\n${manual}\n${finalNote}\n`, finalNote);
  assert.deepEqual(testedLedgerMargins(next, finalNote), margins);
  assert.ok(next.includes(manual));
  assert.ok(generator.includes("regenerateTestedLedgerPreservingNotes(previousLedger,"));
});

test("all legacy unmarked chronological notes survive, including those between Updated and the matrix", async () => {
  const original = execFileSync("git", ["show", "149e6241:TESTED.md"], { windowsHide: true, maxBuffer: 8000000 }).toString();
  const current = await readFile("TESTED.md", "utf8"), generator = await readFile("scripts/generate-tested-ledger.mjs", "utf8");
  const finalNote = JSON.parse(/const aiffSpecialistNote =\r?\n  ("(?:[^"\\]|\\.)*");/.exec(generator)[1]);
  const oldMargins = testedLedgerMargins(original, finalNote), newMargins = testedLedgerMargins(current, finalNote);
  // New hand-written results are prepended; the full original prefix must
  // still be present byte-for-byte at the end of the current prefix.
  assert.ok(newMargins.prefix.endsWith(oldMargins.prefix));
  assert.equal(newMargins.suffix, oldMargins.suffix);
  const chronological = original.slice(original.indexOf("Updated "), original.indexOf("## What the labels mean"));
  assert.equal(chronological.length, 747796); assert.ok(current.includes(chronological));
});
