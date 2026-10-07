import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

function diagnostics(body) {
  const virtual = path.resolve(import.meta.dirname, "virtual-scoped-audio-tag-types.ts");
  const options = { noEmit: true, strict: true, skipLibCheck: true, types: [],
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler };
  const host = ts.createCompilerHost(options);
  const original = host.getSourceFile.bind(host);
  host.getSourceFile = (file, ...args) => path.resolve(file) === virtual
    ? ts.createSourceFile(file, `import { validateScopedAudioTags } from "../scripts/lib/scoped-audio-tag-validation.mjs";\n${body}`,
      ts.ScriptTarget.ES2022, true) : original(file, ...args);
  return ts.getPreEmitDiagnostics(ts.createProgram([virtual], options, host));
}
test("validator declarations admit both real scopes and expose nullable missing values", () => {
  assert.deepEqual(diagnostics(`
    const stream = validateScopedAudioTags({}, { title: "音楽" }, { scope: "audio-stream", audioOrdinal: 1 });
    const format = validateScopedAudioTags({}, {}, { scope: "format" });
    const actual: string | null = stream.fields[0].actualValue;
    const ordinal: number | null = format.audioOrdinal;
    const status: "passed" | "failed" = stream.status;
    void [actual, ordinal, status];
  `), []);
});
test("validator declarations reject missing/invalid scope and false nonnull assumptions", () => {
  const errors = diagnostics(`
    validateScopedAudioTags({}, {});
    validateScopedAudioTags({}, {}, { scope: "merged" });
    validateScopedAudioTags({}, {}, { scope: "format", audioOrdinal: "first" });
    const result = validateScopedAudioTags({}, {}, { scope: "audio-stream" });
    const unavailableIsNotText: string = result.fields[0].actualValue;
    void unavailableIsNotText;
  `);
  assert.equal(errors.length, 4);
  assert.ok(errors.some(error => error.code === 2554));
  assert.equal(errors.filter(error => error.code === 2322).length, 3);
});
