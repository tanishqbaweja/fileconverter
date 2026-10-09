// Private progress-bar candidate. No codec/IO/settings/telemetry throttling changes.
import assert from "node:assert/strict";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { STABLE_PROGRESS_UI_BASELINE_SHA256 } from "./stable-progress-ui-recipe.mjs";
export function makeProgressCompositingCandidate(app, css) {
  assert.equal(sha(app), STABLE_PROGRESS_UI_BASELINE_SHA256);
  assert.equal(sha(css), "474a7c3ae9eeae021b9e69a76201fcb115f6978e3b9152528ad906ac5855aa4a");
  const appPatch = ['style={{ width: `${progress}%` }}', 'style={{ transform: `scaleX(${progress / 100})` }}'];
  const cssBefore = css.match(/\.progress-track \{[\s\S]*?\n\}\r?\n\r?\n\.progress-track span \{[\s\S]*?\n\}/)?.[0];
  assert.ok(cssBefore && cssBefore.includes("transition: width 160ms linear;") && cssBefore.includes("min-width: 0.2rem;"));
  const newline = cssBefore.includes("\r\n") ? "\r\n" : "\n";
  const cssAfter = [
    ".progress-track {", "  background: rgba(255, 255, 255, 0.15);", "  border-radius: 99px;",
    "  height: 0.35rem;", "  margin: 0.75rem 0 0.85rem;", "  overflow: hidden;", "  position: relative;", "}", "",
    ".progress-track span {", "  background: var(--coral);", "  display: block;", "  height: 100%;",
    "  width: 100%;", "  transform-origin: left center;", "  transition: transform 160ms linear;", "}", "",
    ".progress-track::before {", '  content: "";', "  position: absolute;", "  inset: 0 auto 0 0;",
    "  width: 0.2rem;", "  background: var(--coral);", "}",
  ].join(newline);
  assert.equal(app.split(appPatch[0]).length, 2); assert.equal(css.split(cssBefore).length, 2);
  const generatedApp = app.replace(...appPatch), generatedCss = css.replace(cssBefore, cssAfter);
  assert.equal(generatedApp.replace(appPatch[1], appPatch[0]), app);
  assert.equal(generatedCss.replace(cssAfter, cssBefore), css);
  return { app: generatedApp, css: generatedCss, appPatch, cssPatch: [cssBefore, cssAfter],
    originalAppSha256: sha(app), originalCssSha256: sha(css), appSha256: sha(generatedApp), cssSha256: sha(generatedCss),
    progressMessagesChanged: false, publishedSourceChanged: false, nativeAllocationCauseProven: false,
    conversionSpeedAcceptance: false, completeChromiumMemoryAcceptance: false };
}
