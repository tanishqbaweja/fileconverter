import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { makeStableProgressUiSource, recoverStableProgressUiBaseline, STABLE_PROGRESS_UI_DEPENDENCIES } from "../scripts/lib/stable-progress-ui-recipe.mjs";

const baseline = await readFile(new URL("../app/converter/ConverterApp.tsx", import.meta.url), "utf8");
const candidate = makeStableProgressUiSource(baseline);

test("Sampled progress UI candidate preserves every original JSX/control/source byte reversibly", () => {
  assert.equal(recoverStableProgressUiBaseline(candidate), baseline);
  assert.equal(makeStableProgressUiSource(recoverStableProgressUiBaseline(candidate)), candidate);
  for (const changed of [candidate + "\n", candidate.replace("No accounts.", "Accounts."), candidate.replace("[profiles]", "[]"), candidate.replace("sourceInspectionError]", "metrics]")])
    assert.throws(() => recoverStableProgressUiBaseline(changed));
  assert.throws(() => makeStableProgressUiSource(baseline + "\n"));
});

test("Candidate hooks are unconditional and invalidate on source, profile, inspection, batch and capability changes, not progress", () => {
  const source = ts.createSourceFile("ConverterApp.tsx", candidate, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.deepEqual(source.parseDiagnostics, []);
  const component = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "ConverterApp");
  const declarations = component.body.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations]);
  for (const [name, dependencies] of Object.entries(STABLE_PROGRESS_UI_DEPENDENCIES)) {
    const declaration = declarations.find(node => node.name.getText(source) === name);
    assert.ok(declaration, `${name} must be an unconditional top-level hook`);
    assert.equal(declaration.initializer.expression.getText(source), "useMemo");
    assert.deepEqual(declaration.initializer.arguments[1].elements.map(node => node.getText(source)), dependencies);
    assert.doesNotMatch(declaration.initializer.arguments[0].getText(source), /\b(metrics|phase|jobState|elapsedMs|jsHeap|warnings)\b/);
  }
  const items = declarations.find(node => node.name.getText(source) === "capabilityItems");
  assert.deepEqual(items.initializer.arguments[1].elements.map(node => node.getText(source)),
    ["capabilities", "batchFiles.length", "workerReady", "mediaProfile", "selectedProfile", "inputMimeType"]);
});

test("Candidate transpiles; no CSS, media pipeline, options, privacy, storage or memory limit changes are implied", () => {
  const result = ts.transpileModule(candidate, { fileName: "ConverterApp.tsx", reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } });
  assert.deepEqual(result.diagnostics, []);
  assert.equal(candidate.split("const publishedFormatsSection = useMemo").length, 2);
  assert.equal(candidate.split(".map((stream").length, baseline.split(".map((stream").length);
});
