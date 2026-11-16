import assert from "node:assert/strict";
export const GENERATED_LEDGER_BEGIN = "<!-- BEGIN GENERATED LEDGER -->";
export const GENERATED_LEDGER_END = "<!-- END GENERATED LEDGER -->";
const matrixBoundary = "## What the labels mean";
const heading = text => {
  const m = /^# Tested conversion ledger\r?\n/.exec(text); assert.ok(m, "Unrecognized ledger heading; refusing to discard notes"); return m[0].length;
};
export function testedLedgerMargins(previous, legacyFooter) {
  if (!previous) return { prefix: "\n", suffix: "\n" };
  const start = heading(previous), begin = previous.indexOf(GENERATED_LEDGER_BEGIN), end = previous.indexOf(GENERATED_LEDGER_END);
  if (begin >= 0 || end >= 0) {
    assert.ok(begin >= start && end > begin, "Incomplete generated-ledger boundaries; refusing destructive regeneration");
    assert.equal(previous.split(GENERATED_LEDGER_BEGIN).length, 2); assert.equal(previous.split(GENERATED_LEDGER_END).length, 2);
    return { prefix: previous.slice(start, begin), suffix: previous.slice(end + GENERATED_LEDGER_END.length) };
  }
  // One-time migration of the existing ledger: its exact final generated
  // paragraph is already present, with manually added notes BEFORE and AFTER.
  const updated = /^Updated [^\r\n]*from the capability registry,/m.exec(previous);
  assert.ok(updated && updated.index >= start && typeof legacyFooter === "string" && legacyFooter.length > 0,
    "Unrecognized legacy generated header/footer; preserving ledger without writing");
  assert.equal(previous.split(legacyFooter).length, 2, "Legacy footer must be unique; refusing to guess where notes start");
  const footer = previous.indexOf(legacyFooter); assert.ok(footer > updated.index);
  // The legacy generator's chronological preamble was also edited by hand,
  // without markers. Preserve ALL of it, not only notes before Updated.
  const matrix = previous.indexOf(matrixBoundary);
  if (matrix >= 0) {
    assert.equal(previous.split(matrixBoundary).length, 2);
    assert.ok(matrix > updated.index && matrix < footer, "Legacy matrix must follow chronology and precede the exact footer");
  }
  return { prefix: previous.slice(start, matrix >= 0 ? matrix : updated.index), suffix: previous.slice(footer + legacyFooter.length) };
}
export function regenerateTestedLedgerPreservingNotes(previous, generated, legacyFooter) {
  const start = heading(generated); assert.ok(generated.trimEnd().endsWith(legacyFooter));
  assert.ok(!generated.includes(GENERATED_LEDGER_BEGIN) && !generated.includes(GENERATED_LEDGER_END));
  const { prefix, suffix } = testedLedgerMargins(previous, legacyFooter);
  const matrix = generated.indexOf(matrixBoundary);
  // Never overwrite the preserved chronology with this older generator's
  // hardcoded chronology. Only refresh its registry/evidence matrix and notes.
  const updated = generated.match(/^Updated [^\r\n]*/m);
  if (matrix >= 0) assert.ok(updated && updated.index < matrix, "Generated matrix requires its metadata header");
  const body = matrix >= 0 ? updated[0] + "\n\n" + generated.slice(matrix) : generated.slice(start);
  return "# Tested conversion ledger\n" + prefix + GENERATED_LEDGER_BEGIN + "\n" + body.trimEnd() + "\n" + GENERATED_LEDGER_END + suffix;
}
