import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { makeAudioTextMetadataCandidate } from "../media/ffmpeg/audio-text-metadata-candidate.mjs";
import { makeAudioTextMetadataBuildRecipe } from "../media/ffmpeg/audio-text-metadata-build-recipe.mjs";
import { makeAudioMetadataBuildWorkflow } from "../scripts/lib/audio-metadata-build-workflow.mjs";
import ts from "typescript";
import { runInNewContext } from "node:vm";
import { conversionProfiles } from "../lib/capability-registry.ts";
import { validateScopedAudioTags } from "../scripts/lib/scoped-audio-tag-validation.mjs";
const source = await readFile("media/ffmpeg/within_remux.c", "utf8"), helper = await readFile("media/ffmpeg/audio-text-metadata.h", "utf8");
test("private native candidate makes exactly three reversible metadata edits and never changes public source/codec/I/O", () => {
  const candidate = makeAudioTextMetadataCandidate(source, helper);
  assert.equal(candidate.edits.length, 3); assert.equal(candidate.publicAcceptance, false); assert.equal(candidate.browserFixVerified, false);
  assert.equal(candidate.codecSettingsChanged, false); assert.equal(candidate.ioChanged, false); assert.equal(candidate.memoryLimitsRaised, false);
  let reversed = candidate.generated; for (const [before, after] of candidate.edits.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, source); assert.ok(candidate.generated.includes("AV_DICT_MULTIKEY"));
  assert.match(candidate.generated, /Audio metadata exceeds the bounded 4096-entry \/ 2 MiB text allowance; refusing silent tag loss/);
  assert.throws(() => makeAudioTextMetadataCandidate(source + "\n", helper));
  assert.throws(() => makeAudioTextMetadataCandidate(source, "wrong helper"));
});
test("bounded atomic merge validates all input before allocation and replaces the destination only after checked dictionary construction", () => {
  assert.match(helper, /maximum_bytes = 2 \* 1024 \* 1024/); assert.match(helper, /maximum_entries = 4096/);
  assert.ok(helper.indexOf("if (length == remaining)") < helper.indexOf("av_dict_set(&merged"));
  assert.ok(helper.indexOf("if (result < 0)") < helper.indexOf("av_dict_free(destination)"));
  assert.match(helper, /av_dict_free\(&merged\);\s*return result;/);
  assert.match(helper, /scope == 1 && av_dict_get\(container_metadata, entry->key, NULL, 0\)/);
  assert.doesNotMatch(helper, /malloc\(|realloc\(|strlen\(|memcpy\(/);
});
test("private no-Docker build recipe preserves existing dependency/configure/linker/cleanup logic and does not compare changed bytes to public artifacts", async () => {
  const original = await readFile("media/ffmpeg/reproduce-nondocker.sh", "utf8"), recipe = makeAudioTextMetadataBuildRecipe(original);
  let reversed = recipe.generated; for (const [before, after] of recipe.edits.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, original); assert.equal(recipe.originalDependencyConfigureAndLinkerFlagsRetained, true);
  assert.match(recipe.generated, /WITHIN_BUILD_CORE_FILTER:-.*within-remux/);
  assert.match(recipe.generated, /within_remux.parent.c/); assert.match(recipe.generated, /within_remux.metadata.c/);
  assert.ok(!recipe.generated.includes("Non-Docker FFmpeg artifacts differ from the published engine."));
  assert.throws(() => makeAudioTextMetadataBuildRecipe(original + "\n"));
});
test("existing workflow changes only private core dispatch/artifact upload on the build branch", async () => {
  const original = await readFile(".github/workflows/reproduce-ffmpeg-nondocker.yml", "utf8"), recipe = makeAudioMetadataBuildWorkflow(original);
  let reversed = recipe.generated; for (const [before, after] of recipe.edits.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, original); assert.equal(recipe.edits.length, 2); assert.equal(recipe.publicAcceptance, false);
  assert.equal(recipe.originalSdkDependencyAndCleanupStepsRetained, true); assert.match(recipe.generated, /retention-days: 1/);
});
test("expanded real-browser cases retain six implemented routes including the exact private q7 candidate, with25 fields and strict loss detection", async () => {
  const text = await readFile("tests/browser/audio-expanded-metadata.spec.ts", "utf8");
  const tree = ts.createSourceFile("audio.ts", text, ts.ScriptTarget.Latest, true); let expression;
  const visit = node => { if (ts.isVariableDeclaration(node) && node.name.getText(tree) === "tags") expression = node.initializer.getText(tree); ts.forEachChild(node, visit); };
  visit(tree); const tags = JSON.parse(JSON.stringify(runInNewContext("(" + expression + ")")));
  assert.equal(Object.keys(tags).length, 25);
  assert.equal(validateScopedAudioTags({ format: { tags } }, tags, { scope: "format" }).status, "passed");
  const limited = Object.fromEntries(Object.entries(tags).slice(0, 7));
  const failed = validateScopedAudioTags({ format: { tags: limited } }, tags, { scope: "format" });
  assert.equal(failed.status, "failed"); assert.equal(failed.fields.filter(field => field.status === "missing").length, 18);
  const routes = [...text.matchAll(/\{ source: "(\w+)", destination: "(\w+)" \}/g)]; assert.equal(routes.length, 6);
  for (const row of routes) {
    const profile = conversionProfiles.find(profile => profile.id === `${row[1]}-to-${row[2]}`); assert.ok(profile);
    if (profile.id === "opus-to-ogg") {
      assert.equal(profile.public, false); assert.equal(profile.automatedTestStatus, "pending"); assert.equal(profile.maxTestedBytes, null);
    } else { assert.equal(profile.public, true); assert.equal(profile.automatedTestStatus, "passed"); }
  }
  assert.ok(text.indexOf('report.fullIndependentDecode = true') < text.indexOf('expect(outputTags.status'));
  assert.ok(text.includes("file.slice(offset, offset + count).arrayBuffer()")); assert.ok(!text.includes("file.arrayBuffer()"));
  assert.match(text, /await runtime.close\(\)/); assert.match(text, /fullMetadataAcceptance: false/);
});
