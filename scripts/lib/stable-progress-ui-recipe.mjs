// Reuse only unchanged display trees; retain every original JSX byte and control.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export const STABLE_PROGRESS_UI_BASELINE_SHA256 = "b93cb0095b0286f84e58fe8b9bc6ae4bc415b5487d9e06b0fc72f365f37bce6b";
const sha = source => createHash("sha256").update(source).digest("hex");
const main = '  return (\n    <main>';
const once = (source, text) => assert.equal(source.split(text).length, 2, text);
export const STABLE_PROGRESS_UI_DEPENDENCIES = Object.freeze({
  sourceInspectionSection: ["file", "inputFormat", "batchFiles.length", "totalInputBytes", "sourceMediaInspection", "sourceStructuredInspection", "sourceImageInspection", "sourcePackageInspection", "sourceInspectionStatus", "sourceInspectionError"],
  outputFormatOptions: ["profiles"],
  mediaPlanSection: ["mediaConversionPlan", "batchFiles.length"],
  capabilityStrip: ["capabilityItems"],
});
const sections = [
  { name: "sourceInspectionSection", begin: '          {file ? (\n            <details className="source-inspection"', end: '\n\n          {error && !file ?', indent: 10, expression: true },
  { name: "outputFormatOptions", begin: '                    {profiles.map((profile) => (\n                      <option', end: '\n                  </select>', indent: 20, expression: true },
  { name: "mediaPlanSection", begin: '              {mediaConversionPlan ? (\n                <section', end: '\n\n              {automaticRouteNotice ?', indent: 14, expression: true },
  { name: "capabilityStrip", begin: '        <div className="capability-strip">', end: '\n        <div className="storage-card">', indent: 8, expression: false },
];
const prefix = name => `  const ${name} = useMemo(() => (\n`;
const suffix = name => `\n  ), [${STABLE_PROGRESS_UI_DEPENDENCIES[name].join(", ")}]);\n\n`;
const placeholder = section => `${" ".repeat(section.indent)}{${section.name}}`;
const itemsBefore = '  const capabilityItems: [string, boolean][] = capabilities';
const itemsAfter = '  const capabilityItems = useMemo<[string, boolean][]>(() => capabilities';
const itemsEndBefore = '    : [];\n\n  // The compiled registry is immutable;';
const itemsEndAfter = '    : [], [capabilities, batchFiles.length, workerReady, mediaProfile, selectedProfile, inputMimeType]);\n\n  // The compiled registry is immutable;';

export function makeStableProgressUiSource(source) {
  assert.equal(sha(source), STABLE_PROGRESS_UI_BASELINE_SHA256, "Exact current production UI required");
  let result = source.replaceAll("\r\n", "\n");
  once(result, main); once(result, itemsBefore); once(result, itemsEndBefore);
  result = result.replace(itemsBefore, itemsAfter).replace(itemsEndBefore, itemsEndAfter);
  let definitions = "";
  for (const section of sections) {
    once(result, section.begin);
    const start = result.indexOf(section.begin), end = result.indexOf(section.end, start);
    assert.ok(end > start, section.name);
    const original = result.slice(start, end);
    assert.ok(!section.expression || original.endsWith("}"));
    const expression = section.expression ? original.slice(section.indent + 1, -1) : original;
    definitions += prefix(section.name) + expression + suffix(section.name);
    result = result.slice(0, start) + placeholder(section) + result.slice(end);
  }
  result = result.replace(main, definitions + main);
  assert.equal(recoverStableProgressUiBaseline(result), source);
  return result;
}

export function recoverStableProgressUiBaseline(source) {
  if (sha(source) === STABLE_PROGRESS_UI_BASELINE_SHA256) return source;
  let result = source.replaceAll("\r\n", "\n");
  for (const section of sections) {
    const head = prefix(section.name), tail = suffix(section.name);
    once(result, head); once(result, placeholder(section));
    const start = result.indexOf(head), end = result.indexOf(tail, start);
    assert.ok(end > start, section.name);
    const expression = result.slice(start + head.length, end);
    const original = section.expression ? " ".repeat(section.indent) + "{" + expression + "}" : expression;
    assert.ok(original.startsWith(section.begin));
    result = result.slice(0, start) + result.slice(end + tail.length);
    result = result.replace(placeholder(section), original);
  }
  once(result, itemsAfter); once(result, itemsEndAfter);
  result = result.replace(itemsAfter, itemsBefore).replace(itemsEndAfter, itemsEndBefore);
  for (const candidate of [result, result.replaceAll("\n", "\r\n")]) {
    if (sha(candidate) === STABLE_PROGRESS_UI_BASELINE_SHA256) return candidate;
  }
  assert.fail("Reject every change beyond exact display-tree reuse and line endings");
}
