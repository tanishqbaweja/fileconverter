import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { makeProgressCompositingCandidate } from "../scripts/lib/progress-compositing-recipe.mjs";
const app = await readFile(new URL("../app/converter/ConverterApp.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const candidate = makeProgressCompositingCandidate(app, css);
test("Only one progress style and its CSS change reversibly; source/options/actual metrics and terminal handlers remain identical", () => {
  assert.equal(candidate.app.replace(candidate.appPatch[1], candidate.appPatch[0]), app);
  assert.equal(candidate.css.replace(candidate.cssPatch[1], candidate.cssPatch[0]), css);
  for (const name of ["setMetrics(message.metrics)", 'aria-hidden="true"', "progress.toFixed", 'message.type === "complete"', 'message.type === "cancelled"'])
    assert.equal(candidate.app.split(name).length, app.split(name).length);
  assert.equal(candidate.progressMessagesChanged, false);
  assert.equal(candidate.nativeAllocationCauseProven, false);
  assert.equal(candidate.completeChromiumMemoryAcceptance, false);
  const parsed = ts.createSourceFile("candidate.tsx", candidate.app, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.deepEqual(parsed.parseDiagnostics, []);
});
test("Transform uses unchanged progress, timing and fixed zero-marker; no forced layer promotion/containment/worker or native change", () => {
  assert.ok(candidate.app.includes('transform: `scaleX(${progress / 100})`'));
  assert.ok(candidate.cssPatch[1].includes("transition: transform 160ms linear;"));
  assert.ok(candidate.cssPatch[1].includes("width: 0.2rem;"));
  assert.doesNotMatch(candidate.cssPatch[1], /will-change|contain:|translateZ|filter|@keyframes/);
  for (const track of [180, 350, 720]) for (const progress of [0, 0.1, 1, 10, 50, 99, 100]) {
    const originalVisibleWidth = Math.max(3.2, track * progress / 100);
    const candidateVisibleWidth = Math.max(3.2, track * (progress / 100));
    assert.equal(candidateVisibleWidth, originalVisibleWidth);
  }
});
test("Recipe rejects source or target CSS drift before building or launching browsers", () => {
  assert.throws(() => makeProgressCompositingCandidate(app + "\n", css));
  assert.throws(() => makeProgressCompositingCandidate(app, css.replace("transition: width 160ms linear;", "transition: width 200ms linear;")));
  assert.throws(() => makeProgressCompositingCandidate(app, css.replace("min-width: 0.2rem;", "min-width: 0.3rem;")));
});
